import { useCurrency } from '../../../shared/contexts/CurrencyContext';
import { PlusIcon, MinusIcon, TrashIcon } from '../../../shared/components/ui/SvgIcons';
import { getImageUrl, getPrimaryImageUrl } from '../../../shared/utils/imageUtils';
import { useState } from 'react';

const CartItem = ({ item, onUpdateQuantity, onRemove, checked = true, onCheck = () => {} }) => {
  const { id, product, quantity, price: itemPrice, useOriginalProduct, selectedVariation } = item;
  const { name, price: originalPrice, hasDiscount, discountInfo } = product || {};
  const { formatPrice } = useCurrency();
  const [imageError, setImageError] = useState(false);
  
  // Use discounted price if available, otherwise use original price
  const displayPrice = itemPrice || originalPrice;

  // Resolve cart image from variation first, then all known product image fields.
  const imageCandidate =
    selectedVariation?.imageUrl ||
    selectedVariation?.ImageURL ||
    selectedVariation?.image ||
    getPrimaryImageUrl(product);
  const imageUrl = getImageUrl(imageCandidate);

  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <div className="cart-item">
      
      {/* Product Section */}
      <div className="cart-item-product">
        <div className="cart-item-image">
          {!imageError && imageUrl && imageUrl !== 'undefined' && imageUrl !== 'null' ? (
            <img 
              src={imageUrl} 
              alt={name || 'Product image'}
              onError={handleImageError}
              loading="lazy"
            />
          ) : (
            <div className="image-placeholder">
              📦
            </div>
          )}
        </div>
        <div className="cart-item-details">
          <h3 className="cart-item-name">{name}</h3>
          {selectedVariation && !useOriginalProduct && (
            <div className="cart-item-variant">
              <span className="variant-pill">
                Color: {selectedVariation.color || selectedVariation.name}
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Price Section */}
      <div className="cart-item-price">
        {hasDiscount && discountInfo ? (
          <div className="discounted-price-display">
            <span className="discounted-price">{formatPrice(discountInfo.discountedPrice)}</span>
            <span className="original-price-crossed">{formatPrice(originalPrice)}</span>
            <span className="discount-badge">
              {discountInfo.discountType === 'percentage' 
                ? `-${discountInfo.discountValue}%` 
                : `-${formatPrice(discountInfo.discountAmount)}`
              }
            </span>
          </div>
        ) : (
          <span className="regular-price">{formatPrice(displayPrice)}</span>
        )}
      </div>
      
      {/* Quantity Section */}
      <div className="cart-item-quantity">
        <div className="quantity-controls">
          <button 
            className="quantity-btn quantity-btn-minus"
            onClick={() => onUpdateQuantity(id, quantity - 1)}
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
          >
            <MinusIcon size={16} color="currentColor" />
          </button>
          <span className="quantity-display">{quantity}</span>
          <button 
            className="quantity-btn quantity-btn-plus"
            onClick={() => onUpdateQuantity(id, quantity + 1)}
            aria-label="Increase quantity"
          >
            <PlusIcon size={16} color="currentColor" />
          </button>
        </div>
      </div>
      
      {/* Delete Button */}
      <div className="cart-item-actions">
        <button 
          className="cart-item-delete-btn"
          onClick={() => onRemove(id)}
          title="Remove item"
          aria-label="Remove item from cart"
        >
          <TrashIcon size={16} color="currentColor" />
        </button>
      </div>
      
    </div>
  );
};

export default CartItem; 