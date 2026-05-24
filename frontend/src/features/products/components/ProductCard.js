import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../shared/contexts/CartContext';
import { useCurrency } from '../../../shared/contexts/CurrencyContext';
import { useWishlist } from '../../../shared/contexts/WishlistContext';
import { StarIcon } from '../../../shared/components/ui/SvgIcons';
import QuickViewModal from '../../../shared/components/ui/QuickViewModal';
import AudioLoader from '../../../shared/components/ui/AudioLoader';
import { getPrimaryImageUrl } from '../../../shared/utils/imageUtils';
import { getSellableStock } from '../../../shared/utils/productUtils';
import { resolveDiscountedDisplayPrice } from '../../../shared/utils/discountUtils';
import { useAvailableStock } from '../../../shared/hooks/useAvailableStock';
import './product-card.css';

const ProductCard = ({ product }) => {
  const { 
    id, 
    name, 
    price, 
    rating = 0,
    hasDiscount = false,
    discountInfo = null,
    categoryName,
    stockQuantity = 0,
    stock = 0,
    availableStock = null,
    soldQuantity = 0,
    hasVariations = false,
    requiresVariationSelection = false,
    slug,
    has3DModel = false,
    Has3DModel = false,
    model3D = null,
    Model3D = null
  } = product || {
    id: 1,
    name: 'Product Name',
    price: 0,
    rating: 0
  };

  const { formatPrice } = useCurrency();
  const initialStock =
    availableStock !== null && availableStock !== undefined
      ? availableStock
      : getSellableStock(product);
  const currentAvailableStock = useAvailableStock(id, initialStock);
  const [currentSoldQuantity, setCurrentSoldQuantity] = useState(
    Number(soldQuantity ?? product?.sold ?? 0) || 0
  );

  useEffect(() => {
    const fromProduct = Number(soldQuantity ?? product?.sold ?? 0) || 0;
    if (fromProduct > 0) {
      setCurrentSoldQuantity(fromProduct);
    }
  }, [soldQuantity, product?.sold]);

  const {
    displayPrice,
    originalPrice,
    hasDiscount: showDiscount,
  } = resolveDiscountedDisplayPrice(price, hasDiscount ? discountInfo : null);
  const discountPercentage = showDiscount && discountInfo && discountInfo.discountType === 'percentage'
    ? discountInfo.discountValue
    : null;

  // Stock status logic - use available stock if available, otherwise use regular stock
  const currentStock = currentAvailableStock !== null ? currentAvailableStock : getSellableStock(product);
  const getStockStatus = () => {
    if (currentStock === 0) {
      return { status: 'sold-out', label: 'Sold Out', color: '#DC3545', bgColor: '#F8D7DA' };
    } else if (currentStock <= 5) {
      return { status: 'low-stock', label: `Only ${currentStock} left`, color: '#856404', bgColor: '#FFF3CD' };
    } else if (currentStock <= 10) {
      return { status: 'limited-stock', label: `Limited Stock`, color: '#856404', bgColor: '#FFF3CD' };
    } else {
      return { status: 'in-stock', label: 'In Stock', color: '#155724', bgColor: '#D4EDDA' };
    }
  };

  const stockStatus = getStockStatus();

  // Check if product has 3D model (supports all backend/frontend key variants)
  const has3DModelData = Boolean(
    has3DModel ||
    Has3DModel ||
    product?.has3dModel ||
    product?.has3DModel ||
    model3D ||
    Model3D ||
    product?.model3d ||
    product?.model3D ||
    product?.model3DURL
  );

  // Use the utility function to get the primary image URL
  const imageUrl = getPrimaryImageUrl(product);

  const { addToCart, canAddItem } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const navigate = useNavigate();
  const [quickOpen, setQuickOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  const productDetailPath = `/product/${product.slug || product.sku || product.id}`;
  const product3DPath = `/3d-products/${product.slug || product.sku || product.id}`;

  const handleCardClick = () => {
    if (isNavigating) return;

    setIsNavigating(true);
    setTimeout(() => {
      navigate(productDetailPath);
    }, 100);
  };

  return (
    <div className="product-card-redesigned" onClick={handleCardClick} style={{ position: 'relative' }}>
      {isNavigating && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          borderRadius: '8px',
          cursor: 'wait'
        }}>
          <AudioLoader size="medium" color="#F0B21B" />
        </div>
      )}
      <div className="product-card-image-container">
        {/* 3D Model badge - top left (only show if product has 3D model) */}
        {has3DModelData && (
          <div className="model3d-badge">3D</div>
        )}
        
        {/* Discount badge - top left (only show if there's a discount) */}
        {showDiscount && originalPrice && discountPercentage && (
          <div className="discount-badge">{discountPercentage}% off</div>
        )}
        
        
        {/* Product image */}
        <img className="product-image" src={imageUrl} alt={name} />
        
        {/* Action icons - top right */}
        <div className="action-icons">
          <button 
            className={`action-icon wishlist-btn ${isInWishlist(id) ? 'in-wishlist' : ''}`} 
            aria-label={isInWishlist(id) ? "Remove from wishlist" : "Add to wishlist"} 
            title={isInWishlist(id) ? "Remove from wishlist" : "Add to wishlist"}
            onClick={(e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              toggleWishlist(product);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate('/wishlist');
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={isInWishlist(id) ? "#FCBD45" : "none"} stroke="#FCBD45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
          <button className="action-icon" aria-label="Quick view" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuickOpen(true); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#FCBD45" stroke="#FCBD45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button 
            className="action-icon" 
            aria-label={hasVariations || requiresVariationSelection ? 'Choose options' : 'Add to cart'}
            title={hasVariations || requiresVariationSelection ? 'Choose options on product page' : 'Add to cart'}
            onClick={(e) => { 
              e.preventDefault(); 
              e.stopPropagation();

              if (hasVariations || requiresVariationSelection) {
                const path = slug ? `/product/${slug}` : `/product/${id}`;
                navigate(path);
                return;
              }
              
              if (!canAddItem(product, 1)) {
                return;
              }
              
              addToCart(product, 1); 
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#FCBD45" stroke="#FCBD45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"/>
              <circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
          </button>
          {/* 3D Customize button - only show if product has 3D model */}
          {has3DModelData && (
            <button 
              className="action-icon" 
              aria-label="3D Customize" 
              onClick={(e) => { 
                e.preventDefault(); 
                e.stopPropagation(); 
                navigate(product3DPath);
              }}
              style={{ backgroundColor: '#FFC107', color: '#333' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#FCBD45" stroke="#FCBD45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="product-card-content">
        {/* Category */}
        <div className="product-category" style={{ fontWeight: 'bold' }}>{categoryName || 'Product'}</div>
        
        {/* Product name */}
        <div className="product-name" style={{ fontWeight: 'bold' }}>{name || 'Product Name'}</div>
        
        {/* Price section */}
        <div className="product-price-section">
          <span className="current-price" style={{ fontWeight: 'bold' }}>{formatPrice(displayPrice)}</span>
          {originalPrice && <span className="original-price" style={{ fontWeight: 'bold' }}>{formatPrice(originalPrice)}</span>}
        </div>
        
        {/* Stock indicator */}
        <div className="product-stock-indicator">
          <div 
            className="stock-dot" 
            style={{ backgroundColor: stockStatus.color }}
          ></div>
          <span className="stock-text" style={{ fontWeight: 'bold' }}>
            {currentStock > 0 ? `${currentStock} available` : 'Sold Out'}
          </span>
        </div>
        
        {/* Sold quantity */}
        <div className="product-sold-indicator">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span className="sold-text" style={{ fontWeight: 'bold' }}>{currentSoldQuantity} sold</span>
        </div>
        
        {/* Rating */}
        <div className="product-rating">
          <StarIcon size={16} color="#fbbf24" />
          <span className="rating-value" style={{ fontWeight: 'bold' }}>{rating ? rating.toFixed(1) : '0.0'}</span>
        </div>
      </div>

      <QuickViewModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        product={product}
        formatPrice={formatPrice}
        onAddToCart={(p) => {
          if (hasVariations || requiresVariationSelection) {
            const path = slug ? `/product/${slug}` : `/product/${id}`;
            setQuickOpen(false);
            navigate(path);
            return;
          }
          if (!canAddItem(p, 1)) {
            return;
          }
          addToCart(p, 1);
          setQuickOpen(false);
        }}
      />

    </div>
  );
};

export default ProductCard; 