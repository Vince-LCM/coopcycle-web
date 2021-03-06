<?php

namespace AppBundle\Entity\LocalBusiness;

use ApiPlatform\Core\Annotation\ApiSubresource;
use Sylius\Component\Product\Model\ProductInterface;
use Sylius\Component\Product\Model\ProductOptionInterface;
use Sylius\Component\Taxonomy\Model\TaxonInterface;
use Symfony\Component\Serializer\Annotation\Groups;

trait CatalogTrait
{
    /**
     * @ApiSubresource
     */
    protected $orders;

    /**
     * @ApiSubresource
     */
    protected $products;

    protected $productOptions;

    protected $taxons;

    /**
     * @Groups({"restaurant"})
     */
    protected $activeMenuTaxon;

    public function getOrders()
    {
        return $this->orders;
    }

    public function getProducts()
    {
        return $this->products;
    }

    public function hasProduct(ProductInterface $product)
    {
        return $this->products->contains($product);
    }

    public function addProduct(ProductInterface $product)
    {
        $product->setRestaurant($this);

        if (!$this->products->contains($product)) {
            $this->products->add($product);
        }
    }

    public function getProductOptions()
    {
        return $this->productOptions;
    }

    public function addProductOption(ProductOptionInterface $productOption)
    {
        if (!$this->productOptions->contains($productOption)) {
            $this->productOptions->add($productOption);
        }
    }

    public function getActiveMenuTaxon()
    {
        return $this->activeMenuTaxon;
    }

    public function getMenuTaxon()
    {
        return $this->activeMenuTaxon;
    }

    public function setMenuTaxon(TaxonInterface $taxon)
    {
        $this->activeMenuTaxon = $taxon;
    }

    public function hasMenu()
    {
        return null !== $this->activeMenuTaxon;
    }

    public function getTaxons()
    {
        return $this->taxons;
    }

    public function addTaxon(TaxonInterface $taxon)
    {
        // TODO Check if this is a root taxon
        $this->taxons->add($taxon);
    }

    public function removeTaxon(TaxonInterface $taxon)
    {
        if ($this->getTaxons()->contains($taxon)) {
            $this->getTaxons()->removeElement($taxon);
        }
    }
}
