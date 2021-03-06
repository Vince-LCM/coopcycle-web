<?php

namespace AppBundle\Utils;

use AppBundle\Sylius\Order\OrderInterface;
use Carbon\Carbon;
use Predis\Client as Redis;

class PreparationTimeResolver
{
    private $preparationTimeCalculator;
    private $pickupTimeResolver;
    private $redis;

    public function __construct(
        PreparationTimeCalculator $preparationTimeCalculator,
        PickupTimeResolver $pickupTimeResolver,
        Redis $redis)
    {
        $this->preparationTimeCalculator = $preparationTimeCalculator;
        $this->pickupTimeResolver = $pickupTimeResolver;
        $this->redis = $redis;
    }

    /**
     * @param OrderInterface $order
     * @param \DateTime $dropoff
     *
     * @return \DateTime
     */
    public function resolve(OrderInterface $order, \DateTime $dropoff): \DateTime
    {
        $preparationTime = $this->preparationTimeCalculator
            ->createForRestaurant($order->getRestaurant())
            ->calculate($order);

        $extraTime = '0 minutes';
        if ($preparationDelay = $this->redis->get('foodtech:preparation_delay')) {
            $extraTime = sprintf('%d minutes', intval($preparationDelay));
        }

        $pickup = $this->pickupTimeResolver->resolve($order, $dropoff);

        $preparation = clone $pickup;
        $preparation->sub(date_interval_create_from_date_string($preparationTime));
        $preparation->sub(date_interval_create_from_date_string($extraTime));

        return $preparation;
    }
}
