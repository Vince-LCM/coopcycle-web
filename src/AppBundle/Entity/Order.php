<?php

namespace AppBundle\Entity;

use AppBundle\Entity\Cart\CartItem;
use AppBundle\Entity\Menu\Modifier;
use AppBundle\Entity\Base\MenuItem;
use AppBundle\Entity\Model\TaxableTrait;
use AppBundle\Validator\Constraints\Order as AssertOrder;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use ApiPlatform\Core\Annotation\ApiProperty;
use ApiPlatform\Core\Annotation\ApiResource;
use Ramsey\Uuid\Uuid;
use Sylius\Component\Order\Model\AdjustmentInterface;
use Sylius\Component\Order\Model\OrderInterface;
use Sylius\Component\Order\Model\OrderItemInterface;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Context\ExecutionContextInterface;

/**
 * An order is a confirmation of a transaction (a receipt), which can contain multiple line items, each represented by an Offer that has been accepted by the customer.
 *
 * @see http://schema.org/Order Documentation on Schema.org
 *
 * @AssertOrder
 */
class Order implements OrderInterface
{
    use TaxableTrait;

    // the order is created but not paid yet
    const STATUS_CREATED            = 'CREATED';
    // the payment for this order failed
    const STATUS_PAYMENT_ERROR      = 'PAYMENT_ERROR';
    // the order is paid, has to be accepted by the restaurant owner
    const STATUS_WAITING            = 'WAITING'; // FIXME Should be STATUS_PAID
    // the order is accepted by the restaurant owner, he needs to prepare it
    const STATUS_ACCEPTED           = 'ACCEPTED';
    // the order has been refused by the restaurant owner
    const STATUS_REFUSED            = 'REFUSED';
    // the order is ready to be picked up
    const STATUS_READY              = 'READY';
    // the order has been cancelled (by an admin)
    const STATUS_CANCELED           = 'CANCELED';

    /**
     * @var int
     *
     * @Groups({"order"})
     */
    private $id;

    /**
     * @var ApiUser Party placing the order or paying the invoice.
     *
     * @Groups({"order"})
     */
    private $customer;

    /**
     * @var Restaurant
     *
     * @Groups({"order_create", "order", "place"})
     * @ApiProperty(iri="https://schema.org/restaurant")
     */
    private $restaurant;

    /**
     * @var OrderItem The item ordered.
     *
     * @Groups({"order_create", "order"})
     */
    private $orderedItem;

    private $events;

    /**
     * @var string
     *
     * @Groups({"order"})
     */
    private $status;

    /**
     * @Assert\NotNull
     * @Assert\Valid
     * @Groups({"order_create", "order"})
     */
    private $delivery;

    /**
     * The time the order should be ready.
     *
     * @Groups({"order"})
     */
    private $readyAt;

    /**
     * @Groups({"order"})
     */
    private $createdAt;

    private $updatedAt;

    /**
     * @var string
     */
    private $uuid;

    /**
     * @var string
     */
    private $charge;

    public function __construct()
    {
        $this->status = self::STATUS_CREATED;
        $this->orderedItem = new ArrayCollection();
        $this->events = new ArrayCollection();
    }

    public function prePersist() {
        $this->uuid = Uuid::uuid4()->toString();
    }

    /**
     * Gets id.
     *
     * @return int
     */
    public function getId()
    {
        return $this->id;
    }

    /**
     * Sets customer.
     *
     * @param ApiUser $customer
     *
     * @return $this
     */
    public function setCustomer(ApiUser $customer)
    {
        $this->customer = $customer;

        return $this;
    }

    /**
     * Gets customer.
     *
     * @return ApiUser
     */
    public function getCustomer()
    {
        return $this->customer;
    }

    /**
     * Sets orderedItem.
     *
     * @param OrderItem[] $orderedItem
     *
     * @return $this
     */
    public function setOrderedItem($orderedItem)
    {
        $orderedItem = array_map(function (OrderItem $orderedItem) {
            return $orderedItem->setOrder($this);
        }, $orderedItem);

        $this->orderedItem = $orderedItem;

        return $this;
    }

    /**
     * Gets orderedItem.
     *
     * @return OrderItem
     */
    public function getOrderedItem()
    {
        return $this->orderedItem;
    }

    public function addOrderedItem(OrderItem $orderedItem)
    {
        $orderedItem->setOrder($this);
        $this->orderedItem->add($orderedItem);

        return $this;
    }

    public function addCartItem(CartItem $cartItem, MenuItem $menuItem) {

        $orderedItem = new OrderItem();
        $orderedItem->setMenuItem($menuItem);
        $orderedItem->setQuantity($cartItem->getQuantity());
        $orderedItem->setPrice($cartItem->getUnitPrice());

        foreach ($cartItem->getModifierChoices() as $modifierId => $selectedMenuItems) {

            $modifier = $menuItem->getModifiers()->filter(function ($element) use ($modifierId) {
                return $element->getId() == $modifierId;
            })->first();

            foreach ($selectedMenuItems as $selectedModifierId) {
                $orderedItemModifier = new OrderItemModifier();

                // get the price for each selected menu item (depends on the Modifier's calculus strategy)
                $menuItem = $modifier->getModifierChoices()->filter(
                    function (Modifier $element) use ($selectedModifierId) {
                        return $element->getId() == $selectedModifierId;
                    }
                )->first();

                $orderedItemModifier->setName($menuItem->getName());
                $orderedItemModifier->setDescription($menuItem->getDescription());
                $orderedItemModifier->setAdditionalPrice($menuItem->getPrice());
                $orderedItemModifier->setModifier($modifier);
                $orderedItem->addModifier($orderedItemModifier);
            }
        }

        $this->addOrderedItem($orderedItem);

    }

    /**
     * Sets restaurant.
     *
     * @param Restaurant $restaurant
     *
     * @return $this
     */
    public function setRestaurant(Restaurant $restaurant)
    {
        $this->restaurant = $restaurant;

        if (null !== $this->delivery) {
            $this->delivery->setPriceFromOrder($this);
            $this->delivery->setOriginAddressFromOrder($this);
        }

        return $this;
    }

    /**
     * Gets restaurant.
     *
     * @return Restaurant
     */
    public function getRestaurant()
    {
        return $this->restaurant;
    }

    public function getReadyAt()
    {
        return $this->readyAt;
    }

    public function setReadyAt($readyAt)
    {
        $this->readyAt = $readyAt;

        return $this;
    }

    public function getCreatedAt(): ?\DateTimeInterface
    {
        return $this->createdAt;
    }

    public function setCreatedAt(?\DateTimeInterface $createdAt)
    {

    }

    public function getUpdatedAt(): ?\DateTimeInterface
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(?\DateTimeInterface $createdAt)
    {

    }

    public function getItemsTotal(): int
    {
        $total = 0;

        foreach ($this->orderedItem as $orderedItem) {
            $total += $orderedItem->getPrice() * $orderedItem->getQuantity();
        }

        return $total;
    }

    /**
     * Gets the value of status.
     *
     * @return string
     */
    public function getStatus()
    {
        return $this->status;
    }

    /**
     * Sets the value of status.
     *
     * @param string $status the status
     *
     * @return self
     */
    public function setStatus($status)
    {
        $this->status = $status;

        return $this;
    }

    /**
     * @return ArrayCollection|OrderEvent[]
    */
    public function getEvents()
    {
        return $this->events;
    }

    /**
     * @return Delivery
     */
    public function getDelivery()
    {
        return $this->delivery;
    }

    public function setDelivery(Delivery $delivery)
    {
        $delivery->setOrder($this);
        $this->delivery = $delivery;

        return $this;
    }

    public function getCharge()
    {
        return $this->charge;
    }

    public function setCharge($charge)
    {
        $this->charge = $charge;

        return $this;
    }

    /**
     * @return string
     */
    public function getUuid(): string
    {
        return $this->uuid;
    }

    /**
     * @param string $uuid
     */
    public function setUuid(string $uuid)
    {
        $this->uuid = $uuid;
    }

    /**
     * @deprecated
     */
    public function getPreparationDate()
    {
        $preparationDate = clone $this->delivery->getDate();

        $preparationDate->modify(sprintf('-%d minutes', Restaurant::PREPARATION_AND_DELIVERY_DELAY));

        return $preparationDate;
    }

    /**
     * Returns the time it takes to prepare the order, in seconds.
     * @return int
     */
    public function getDuration()
    {
        return Restaurant::PREPARATION_DELAY * 60;
    }

    /* AdjustableInterface methods */

    /**
     * {@inheritdoc}
     */
    public function getAdjustments(?string $type = null): Collection
    {
    }

    /**
     * {@inheritdoc}
     */
    public function addAdjustment(AdjustmentInterface $adjustment): void
    {
    }

    /**
     * {@inheritdoc}
     */
    public function removeAdjustment(AdjustmentInterface $adjustment): void
    {
    }

    /**
     * {@inheritdoc}
     */
    public function getAdjustmentsTotal(?string $type = null): int
    {
    }

    /**
     * {@inheritdoc}
     */
    public function removeAdjustments(?string $type = null): void
    {
    }

    /**
     * {@inheritdoc}
     */
    public function recalculateAdjustmentsTotal(): void
    {
    }

    /* OrderInterface methods */

    /**
     * {@inheritdoc}
     */
    public function getCheckoutCompletedAt(): ?\DateTimeInterface
    {
    }

    /**
     * {@inheritdoc}
     */
    public function setCheckoutCompletedAt(?\DateTimeInterface $checkoutCompletedAt): void
    {
    }

    /**
     * @return bool
     */
    public function isCheckoutCompleted(): bool
    {
        // TODO Implement
    }

    public function completeCheckout(): void
    {
    }

    /**
     * {@inheritdoc}
     */
    public function getNumber(): ?string
    {
        return $this->getUuid();
    }

    /**
     * {@inheritdoc}
     */
    public function setNumber(?string $number): void
    {
        $this->uuid = $number;
    }

    /**
     * {@inheritdoc}
     */
    public function getNotes(): ?string
    {
    }

    /**
     * {@inheritdoc}
     */
    public function setNotes(?string $notes): void
    {
    }

    /**
     * {@inheritdoc}
     */
    public function getItems(): Collection
    {
        // TODO Implement
    }

    public function clearItems(): void
    {
        // TODO Implement
    }

    /**
     * {@inheritdoc}
     */
    public function countItems(): int
    {
        return count($this->orderedItem);
    }

    /**
     * {@inheritdoc}
     */
    public function addItem(OrderItemInterface $item): void
    {
    }

    /**
     * {@inheritdoc}
     */
    public function removeItem(OrderItemInterface $item): void
    {
    }

    /**
     * {@inheritdoc}
     */
    public function hasItem(OrderItemInterface $item): bool
    {
    }

    /**
     * {@inheritdoc}
     */
    // public function getItemsTotal(): int
    // {
    // }

    public function recalculateItemsTotal(): void
    {
    }

    /**
     * {@inheritdoc}
     */
    public function getTotal(): int
    {
        $total = 0;

        if ($this->getDelivery()) {
            $total = $this->getDelivery()->getPrice();
        }

        $total += $this->getItemsTotal();

        return $total * 100;
    }

    /**
     * {@inheritdoc}
     */
    public function getTotalQuantity(): int
    {
    }

    /**
     * {@inheritdoc}
     */
    public function getState(): string
    {
        $stateMapping = [
            OrderInterface::STATE_CART => [
                self::STATUS_CREATED,
                self::STATUS_WAITING
            ],
            OrderInterface::STATE_NEW => [
                self::STATUS_ACCEPTED,
            ],
            OrderInterface::STATE_CANCELLED => [
                self::STATUS_CANCELED,
                self::STATUS_PAYMENT_ERROR,
                self::STATUS_REFUSED,
            ],
            OrderInterface::STATE_FULFILLED => [
                self::STATUS_READY
            ]
        ];

        foreach ($stateMapping as $state => $values) {
            if (in_array($this->status, $values)) {
                return $state;
            }
        }
    }

    /**
     * {@inheritdoc}
     */
    public function setState(string $state): void
    {
    }

    /**
     * {@inheritdoc}
     */
    public function isEmpty(): bool
    {
        return $this->countItems() === 0;
    }

    /**
     * {@inheritdoc}
     */
    public function getAdjustmentsRecursively(?string $type = null): Collection
    {
    }

    /**
     * {@inheritdoc}
     */
    public function getAdjustmentsTotalRecursively(?string $type = null): int
    {
    }

    /**
     * {@inheritdoc}
     */
    public function removeAdjustmentsRecursively(?string $type = null): void
    {
    }
}
