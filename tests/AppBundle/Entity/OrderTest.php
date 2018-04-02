<?php

namespace AppBundle\Entity;

use AppBundle\BaseTest;
use AppBundle\Entity\Cart\Cart;
use AppBundle\Entity\Cart\CartItem;
use AppBundle\Entity\Menu\MenuItem;
use AppBundle\Utils\ValidationUtils;
use AppBundle\Validator\Constraints\DeliveryDateInFuture;
use Carbon\Carbon;

class OrderTest extends BaseTest
{
    private $validator;

    public function setUp()
    {
        parent::setUp();

        $this->validator = static::$kernel->getContainer()->get('validator');

        Carbon::setTestNow(Carbon::create(2017, 9, 2, 11, 0));
    }

    protected function tearDown()
    {
        Carbon::setTestNow();
        parent::tearDown(); // TODO: Change the autogenerated stub
    }

    public function testAddCartItem()
    {
        $order = new Order();
        $cart = new Cart();

        $pizza = new MenuItem();
        $pizza
            ->setName('Pizza')
            ->setPrice(10);

        $salad = new MenuItem();
        $salad
            ->setName('Salad')
            ->setPrice(5);

        $pizzaItem = new CartItem($cart, $pizza, 4);
        $order->addCartItem($pizzaItem, $pizza);

        $saladItem = new CartItem($cart, $salad, 2);
        $order->addCartItem($saladItem, $salad);

        $this->assertCount(2, $order->getOrderedItem());

        $pizzaItem = $order->getOrderedItem()->filter(function (OrderItem $orderItem) use ($pizza) {
            return $orderItem->getMenuItem() === $pizza;
        })->first();

        $saladItem = $order->getOrderedItem()->filter(function (OrderItem $orderItem) use ($salad) {
            return $orderItem->getMenuItem() === $salad;
        })->first();


        $this->assertEquals(4, $pizzaItem->getQuantity());
        $this->assertEquals(2, $saladItem->getQuantity());
    }

    public function testTotal()
    {
        $order = new Order();
        $cart = new Cart();

        $pizza = new MenuItem();
        $pizza
            ->setName('Pizza')
            ->setPrice(10);

        $salad = new MenuItem();
        $salad
            ->setName('Salad')
            ->setPrice(5);

        $pizzaItem = new CartItem($cart, $pizza, 4);
        $order->addCartItem($pizzaItem, $pizza);

        $saladItem = new CartItem($cart, $salad, 2);
        $order->addCartItem($saladItem, $salad);

        $this->assertEquals(5000, $order->getTotal());
    }

    public function testTotalWithDelivery()
    {
        $contract = new Contract();
        $contract->setFlatDeliveryPrice(10);

        $restaurant = new Restaurant();
        $restaurant->setContract($contract);

        $order = new Order();
        $order->setRestaurant($restaurant);

        $cart = new Cart();

        $pizza = new MenuItem();
        $pizza
            ->setName('Pizza')
            ->setPrice(10);

        $pizzaItem = new CartItem($cart, $pizza, 4);
        $order->addCartItem($pizzaItem, $pizza);

        $delivery = new Delivery($order);

        $this->assertEquals(5000, $order->getTotal());
    }

    public function testSetRestaurantUpdatesDelivery()
    {
        $order = new Order();

        $delivery = new Delivery();

        $order->setDelivery($delivery);

        $this->assertNull($delivery->getOriginAddress());
        $this->assertNull($delivery->getPrice());

        $restaurantAddress = new Address();
        $restaurantAddress->setStreetAddress('XXX');
        $restaurantAddress->setPostalCode('75000');
        $restaurantAddress->setAddressLocality('Paris');

        $contract = new Contract();
        $contract->setMinimumCartAmount(20);
        $contract->setFlatDeliveryPrice(3.50);

        $restaurant = new Restaurant();
        $restaurant->setContract($contract);
        $restaurant->setAddress($restaurantAddress);

        $order->setRestaurant($restaurant);

        $this->assertSame($restaurantAddress, $delivery->getOriginAddress());
        $this->assertEquals(3.50, $delivery->getPrice());
    }
}
