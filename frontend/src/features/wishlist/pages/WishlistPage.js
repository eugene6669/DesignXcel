import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWishlist } from '../../../shared/contexts/WishlistContext';
import { useCurrency } from '../../../shared/contexts/CurrencyContext';
import { useCart } from '../../../shared/contexts/CartContext';
import PageHeader from '../../../shared/components/layout/PageHeader';
import ConfirmationModal from '../../../shared/components/ui/ConfirmationModal';
import { getPrimaryImageUrl } from '../../../shared/utils/imageUtils';
import { 
  HeartIcon, 
  ShoppingBagIcon, 
  TrashIcon
} from '../../../shared/components/ui/SvgIcons';
import './WishlistPage.css';

const WishlistPage = () => {
  const { 
    wishlist, 
    removeFromWishlist, 
    clearWishlist 
  } = useWishlist();
  const { formatPrice } = useCurrency();
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);

  const handleProductClick = (product) => {
    const slug = product?.slug || product?.sku || (typeof product === 'object' ? product?.id : product);
    navigate(`/product/${slug}`);
  };

  const handleRemoveItem = (e, productId) => {
    e.stopPropagation();
    removeFromWishlist(productId);
  };

  const handleClearAll = () => {
    setShowClearConfirmation(true);
  };

  const handleConfirmClear = () => {
    clearWishlist();
    setShowClearConfirmation(false);
  };

  const handleAddToCart = (e, product) => {
    e.stopPropagation();
    addToCart(product, 1);
    navigate('/cart');
  };

  const handleAddAllToCart = () => {
    wishlist.forEach(item => {
      addToCart(item, 1);
    });
    navigate('/cart');
  };

  if (wishlist.length === 0) {
    return (
      <div className="wishlist-page">
        <div className="wishlist-container">
          <div className="wishlist-empty-page">
            <div className="empty-wishlist-content">
              <div className="empty-wishlist-icon">
                <HeartIcon size={48} color="#F0B21B" />
              </div>
              <h1>Your Wishlist is Empty</h1>
              <p>Looks like you haven&apos;t added any items to your wishlist yet.</p>
              <div className="empty-wishlist-actions">
                <button 
                  type="button"
                  className="browse-products-btn"
                  onClick={() => navigate('/products')}
                >
                  <ShoppingBagIcon size={14} color="#ffffff" />
                  Continue Shopping
                </button>
                <button 
                  type="button"
                  className="browse-products-btn"
                  onClick={() => navigate('/')}
                >
                  <ShoppingBagIcon size={14} color="#ffffff" />
                  Back to Home
                </button>
              </div>
            </div>
          </div>
        </div>

        <ConfirmationModal
          isOpen={showClearConfirmation}
          onClose={() => setShowClearConfirmation(false)}
          onConfirm={handleConfirmClear}
          title="Clear Wishlist"
          message="Are you sure you want to remove all items from your wishlist? This action cannot be undone."
          confirmText="Clear Wishlist"
          cancelText="Keep Items"
          type="warning"
        />
      </div>
    );
  }

  return (
    <div className="wishlist-page">
      <div className="wishlist-container">
        <PageHeader
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'My Wishlist' }
          ]}
          title="My Wishlist"
          subtitle={`${wishlist.length} ${wishlist.length === 1 ? 'item' : 'items'} saved`}
        />

        <div className="wishlist-toolbar">
          <button 
            type="button"
            className="wishlist-toolbar-btn wishlist-toolbar-btn--primary"
            onClick={handleAddAllToCart}
          >
            <ShoppingBagIcon size={16} color="#ffffff" />
            Add all to cart
          </button>
          <button 
            type="button"
            className="wishlist-toolbar-btn wishlist-toolbar-btn--muted"
            onClick={handleClearAll}
          >
            <TrashIcon size={16} color="#ffffff" />
            Clear all
          </button>
        </div>

        <div className="wishlist-content">
          <div className="wishlist-grid">
            {wishlist.map((item) => (
              <div 
                key={item.id} 
                className="wishlist-item-card"
                onClick={() => handleProductClick(item)}
              >
                <div className="wishlist-item-image-container">
                  <img 
                    src={getPrimaryImageUrl(item)} 
                    alt={item.name}
                    className="wishlist-item-image"
                    onError={(e) => {
                      e.target.src = '/logo192.png';
                    }}
                  />
                  <button 
                    className="wishlist-remove-btn"
                    onClick={(e) => handleRemoveItem(e, item.id)}
                    title="Remove from wishlist"
                  >
                    <TrashIcon size={16} color="#ffffff" />
                  </button>
                  {item.hasDiscount && item.discountInfo && (
                    <div className="wishlist-discount-badge">
                      {item.discountInfo.discountType === 'percentage' 
                        ? `${item.discountInfo.discountValue}% off`
                        : 'Discount'}
                    </div>
                  )}
                </div>
                
                <div className="wishlist-item-content">
                  <div className="wishlist-item-info">
                    <h3 className="wishlist-item-name">{item.name}</h3>
                    <div className="wishlist-item-price-section">
                      {item.hasDiscount && item.discountInfo ? (
                        <>
                          <span className="original-price">{formatPrice(item.price)}</span>
                          <span className="current-price">{formatPrice(item.discountInfo.discountedPrice)}</span>
                        </>
                      ) : (
                        <span className="current-price">{formatPrice(item.price)}</span>
                      )}
                    </div>
                  </div>
                  
                  <button 
                    className="add-to-cart-btn"
                    onClick={(e) => handleAddToCart(e, item)}
                  >
                    <ShoppingBagIcon size={14} color="#ffffff" />
                    Add to Cart
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showClearConfirmation}
        onClose={() => setShowClearConfirmation(false)}
        onConfirm={handleConfirmClear}
        title="Clear Wishlist"
        message="Are you sure you want to remove all items from your wishlist? This action cannot be undone."
        confirmText="Clear Wishlist"
        cancelText="Keep Items"
        type="warning"
      />
    </div>
  );
};

export default WishlistPage;
