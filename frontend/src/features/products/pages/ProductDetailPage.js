import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useCart } from '../../../shared/contexts/CartContext';
import { useWishlist } from '../../../shared/contexts/WishlistContext';
import { useCurrency } from '../../../shared/contexts/CurrencyContext';
import { getProductById, getProductVariations } from '../services/productService';
import Breadcrumb from '../../../shared/components/layout/Breadcrumb';
import CartSuccessModal from '../../../shared/components/ui/CartSuccessModal';
import ConfirmationModal from '../../../shared/components/ui/ConfirmationModal';
import { PageLoader } from '../../../shared/components/ui';
import ReviewSection from '../../reviews/components/ReviewSection';
import { getImageUrl } from '../../../shared/utils/imageUtils';
import {
  fetchVariationStockMap,
  fetchAvailableStock,
  subscribeStockRefresh
} from '../../../shared/services/availableStockService';
import './product-detail.css';

const ProductDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Extract orderId from URL query parameters (if user came from order history)
  const searchParams = new URLSearchParams(location.search);
  const orderId = searchParams.get('orderId');
  const { addToCart, canAddItem, getMaxQuantityForProduct } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { formatPrice } = useCurrency();
  
  const [product, setProduct] = useState(null);
  const [variations, setVariations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariation, setSelectedVariation] = useState(null);
  const [variationRequiredMessage, setVariationRequiredMessage] = useState('');
  const [activeTab, setActiveTab] = useState('additional-info');
  const [showCartSuccessModal, setShowCartSuccessModal] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [availableStock, setAvailableStock] = useState(null);
  /** Per-variation sellable qty from /available-stock (includes pending reservations). */
  const [variationAvailableById, setVariationAvailableById] = useState({});
  const [showBulkOrderModal, setShowBulkOrderModal] = useState(false);
  const [showInsufficientStockModal, setShowInsufficientStockModal] = useState(false);
  const [insufficientStockMessage, setInsufficientStockMessage] = useState('');
  
  // Maximum quantity for regular checkout
  const MAX_REGULAR_CHECKOUT_QUANTITY = 9;

  // Update meta tags for social sharing
  useEffect(() => {
    if (product) {
      // Update page title
      document.title = `${product.name} - Design Excellence`;
      
      // Update meta description
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', product.description || `Premium ${product.name} from Design Excellence - Quality office furniture for modern workplaces.`);
      }
      
      // Add Open Graph meta tags
      const addOrUpdateMetaTag = (property, content) => {
        let meta = document.querySelector(`meta[property="${property}"]`);
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute('property', property);
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', content);
      };
      
      // Add Twitter Card meta tags
      const addOrUpdateTwitterMeta = (name, content) => {
        let meta = document.querySelector(`meta[name="${name}"]`);
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute('name', name);
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', content);
      };
      
      const productImage = getImageUrl(product.images?.[0] || product.thumbnails?.[0] || '');
      const productDescription = product.description || `Premium ${product.name} from Design Excellence - Quality office furniture for modern workplaces.`;
      
      // Open Graph tags
      addOrUpdateMetaTag('og:title', product.name);
      addOrUpdateMetaTag('og:description', productDescription);
      addOrUpdateMetaTag('og:image', productImage);
      addOrUpdateMetaTag('og:url', window.location.href);
      addOrUpdateMetaTag('og:type', 'product');
      addOrUpdateMetaTag('og:site_name', 'Design Excellence');
      
      // Twitter Card tags
      addOrUpdateTwitterMeta('twitter:card', 'summary_large_image');
      addOrUpdateTwitterMeta('twitter:title', product.name);
      addOrUpdateTwitterMeta('twitter:description', productDescription);
      addOrUpdateTwitterMeta('twitter:image', productImage);
      addOrUpdateTwitterMeta('twitter:site', '@DesignExcellence');
    }
  }, [product]);

  // Load product data
  useEffect(() => {
    const loadProduct = async () => {
      try {
        setLoading(true);
        const response = await getProductById(slug);
        console.log('Product data loaded:', response.product);
        console.log('Product thumbnails:', response.product.thumbnails);
        console.log('Product images:', response.product.images);
        
        // Check if thumbnails are available
        if (!response.product.thumbnails || response.product.thumbnails.length === 0) {
            console.log('No thumbnails found. To add thumbnails:');
            console.log('1. Go to Admin Panel > Products');
            console.log('2. Edit the product');
            console.log('3. Upload thumbnail images');
            console.log('4. Save the product');
        }
        setProduct(response.product);
        // Use availableStock from API response if provided, otherwise reset to null for separate fetch
        if (response.product?.availableStock !== null && response.product?.availableStock !== undefined) {
          console.log('[STOCK] Using availableStock from product API:', response.product.availableStock);
          setAvailableStock(response.product.availableStock);
        } else {
          // Reset availableStock when product changes so it can be fetched fresh
          setAvailableStock(null);
        }
      } catch (error) {
        console.error('Error loading product:', error);
        setError('Failed to load product details');
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      loadProduct();
    }
  }, [slug]);

  // Load variations when product loads
  useEffect(() => {
    if (product) {
      loadVariations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload variations when product changes
  }, [product]);

  const hasVariations =
    variations.length > 0 || Boolean(product?.hasVariations || product?.requiresVariationSelection);

  const variationIdsKey = useMemo(
    () => variations.map((v) => String(v.id)).sort().join(','),
    [variations]
  );

  const anyVariationInStockFromApi = useMemo(() => {
    if (!variations.length) return false;
    return variations.some((v) => {
      const fromMap = variationAvailableById[v.id];
      const q = fromMap !== undefined ? fromMap : Number(v.quantity) || 0;
      return q > 0;
    });
  }, [variations, variationAvailableById]);

  // One API call for all variation sellable qty (includes pending checkout reservations).
  useEffect(() => {
    if (!product?.id || !variations.length) {
      setVariationAvailableById({});
      return undefined;
    }
    let cancelled = false;

    const loadAll = async () => {
      const result = await fetchVariationStockMap(product.id);
      if (cancelled) return;
      if (result.success && result.byVariationId) {
        setVariationAvailableById(result.byVariationId);
        if (result.availableStock != null && !selectedVariation?.id) {
          setAvailableStock(result.availableStock);
        }
      }
    };

    loadAll();
    const unsub = subscribeStockRefresh(loadAll);
    const interval = setInterval(loadAll, 12000);
    return () => {
      cancelled = true;
      unsub();
      clearInterval(interval);
    };
  }, [product?.id, variationIdsKey, selectedVariation?.id]);

  useEffect(() => {
    if (!product?.id || !hasVariations || selectedVariation) return;
    setAvailableStock(anyVariationInStockFromApi ? null : 0);
  }, [product?.id, hasVariations, selectedVariation, anyVariationInStockFromApi]);

  // Selected variation or simple product sellable qty
  useEffect(() => {
    if (!product?.id) {
      setAvailableStock(null);
      return undefined;
    }
    if (hasVariations && !selectedVariation?.id) {
      return undefined;
    }

    let cancelled = false;
    const refresh = async () => {
      const { sellable } = await fetchAvailableStock(product.id, {
        variationId: selectedVariation?.id
      });
      if (cancelled) return;
      if (sellable != null) {
        setAvailableStock(sellable);
      } else if (hasVariations && selectedVariation) {
        setAvailableStock(selectedVariation.quantity || 0);
      } else {
        setAvailableStock(product.stockQuantity || 0);
      }
    };

    refresh();
    const unsub = subscribeStockRefresh(refresh);
    const interval = setInterval(refresh, 12000);
    return () => {
      cancelled = true;
      unsub();
      clearInterval(interval);
    };
  }, [product?.id, product?.stockQuantity, hasVariations, selectedVariation?.id]);

  // Load variations function
  const loadVariations = async () => {
    try {
      const response = await getProductVariations(slug);
      const loaded = response.variations || [];
      setVariations(loaded);
      setSelectedVariation(null);
      setVariationRequiredMessage('');
    } catch (error) {
      console.error('Error loading variations:', error);
    }
  };

  const normalizedThumbnails = useMemo(() => {
    if (!product?.thumbnails) return [];
    if (Array.isArray(product.thumbnails)) return product.thumbnails.filter(Boolean);
    if (typeof product.thumbnails === 'string') {
      const raw = product.thumbnails.trim();
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
        if (parsed && typeof parsed === 'string') return [parsed];
      } catch (e) {
        if (raw.includes(',')) {
          return raw.split(',').map((s) => s.trim()).filter(Boolean);
        }
        return raw ? [raw] : [];
      }
    }
    return [];
  }, [product?.thumbnails]);

  const galleryImages = useMemo(() => {
    if (!product) return [];

    const rawImages = [
      product.image,
      ...(Array.isArray(product.images) ? product.images : (product.images ? [product.images] : [])),
      ...normalizedThumbnails
    ].filter(Boolean);

    const productMainImage = rawImages[0] || null;
    const extraFromProduct = [...new Set(rawImages.slice(1).concat(normalizedThumbnails))].filter(
      (img) => img && img !== productMainImage
    );

    if (selectedVariation) {
      const variationThumbList = Array.isArray(selectedVariation.thumbnails)
        ? selectedVariation.thumbnails.filter(Boolean)
        : [];
      const main =
        selectedVariation.imageUrl ||
        variationThumbList[0] ||
        productMainImage;
      if (variationThumbList.length >= 4) {
        return [main, ...variationThumbList.slice(0, 4)].filter(Boolean);
      }
      const variationExtras = variationThumbList.filter((url) => url !== main);
      const strip = [...new Set([...variationExtras, ...extraFromProduct].filter((url) => url !== main))].slice(
        0,
        4
      );
      return [main, ...strip].filter(Boolean);
    }

    const strip = extraFromProduct.slice(0, 4);
    return productMainImage ? [productMainImage, ...strip] : strip;
  }, [product, normalizedThumbnails, selectedVariation]);

  const handleImageNavigation = (direction) => {
    if (!galleryImages || galleryImages.length <= 1) return;

    if (direction === 'prev') {
      setSelectedImageIndex((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1));
    } else {
      setSelectedImageIndex((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1));
    }
  };

  // Handle adding product to bulk order and navigating
  const handleAddToBulkOrder = () => {
    if (requiresVariationSelection()) {
      return;
    }
    try {
      const productId = String(product.id || product.ProductID);
      const imageUrl = product.ImageURL || product.image || (product.images && product.images[0]) || '';
      
      // Use variation price if selected, otherwise use product price
      const itemPrice = selectedVariation && selectedVariation.price > 0 
        ? selectedVariation.price 
        : (product.price || product.Price || 0);
      
      const bulkOrderItem = {
        id: `${productId}-${Date.now()}-${Math.random()}`,
        productId: productId,
        name: product.name || product.Name,
        price: itemPrice,
        quantity: Math.max(10, quantity), // Ensure minimum 10
        sku: selectedVariation?.sku || product.sku || product.SKU || `SKU-${productId}`,
        stockQuantity: stockQuantity || 0,
        image: imageUrl,
        variationId: selectedVariation?.id || null,
        variationName: selectedVariation?.name || null
      };
      
      // Get existing bulk order items or create new array
      const existingItems = JSON.parse(localStorage.getItem('bulkOrderItems') || '[]');
      
      // Check if product already exists in bulk order
      const existingIndex = existingItems.findIndex(item => 
        String(item.productId) === String(productId) &&
        item.variationId === bulkOrderItem.variationId
      );
      
      if (existingIndex >= 0) {
        // Update existing item quantity
        existingItems[existingIndex].quantity = Math.max(10, existingItems[existingIndex].quantity + quantity);
      } else {
        // Add new item
        existingItems.push(bulkOrderItem);
      }
      
      // Save to localStorage
      localStorage.setItem('bulkOrderItems', JSON.stringify(existingItems));
      
      // Navigate to bulk order page
      navigate('/bulk-order');
    } catch (error) {
      console.error('Error adding to bulk order:', error);
      alert('Failed to add product to bulk order. Please try again.');
    }
  };

  const requiresVariationSelection = () => {
    if (!hasVariations) return false;
    if (selectedVariation?.id) return false;
    setVariationRequiredMessage('Please select an option before adding to cart.');
    return true;
  };

  // Handle add to cart
  const handleAddToCart = async () => {
    if (requiresVariationSelection()) {
      return;
    }

    // If quantity >= 10, check if product can accommodate bulk order
    if (quantity >= 10) {
      // Check if product has enough stock for bulk order (minimum 10)
      if (stockQuantity < 10) {
        setInsufficientStockMessage(`This product does not have enough stock for bulk orders. Available stock: ${stockQuantity}. Minimum required: 10 items.`);
        setShowInsufficientStockModal(true);
        return;
      }
      setShowBulkOrderModal(true);
      return;
    }
    
    // Limit quantity to MAX_REGULAR_CHECKOUT_QUANTITY for regular checkout
    const limitedQuantity = Math.min(quantity, MAX_REGULAR_CHECKOUT_QUANTITY);
    
    if (product && limitedQuantity > 0 && !addingToCart) {
      setAddingToCart(true);
      try {
        // Use variation price if selected, otherwise use product price
        const itemPrice = selectedVariation && selectedVariation.price > 0 
          ? selectedVariation.price 
          : (product.price || product.Price || 0);
        
        // Create product object with variation data and correct price
        const productWithVariation = {
          ...product,
          price: itemPrice,
          sku: hasVariations
            ? (selectedVariation?.sku || product.sku || product.SKU)
            : (product.sku || product.SKU),
          useOriginalProduct: !hasVariations,
          selectedVariation: hasVariations ? selectedVariation : null,
          hasVariations
        };
        
        // Check if we can add this item
        if (!canAddItem(productWithVariation, limitedQuantity)) {
          setAddingToCart(false);
          return;
        }
        
        addToCart(productWithVariation, limitedQuantity);
        
        // If quantity was greater than max, reset to max after adding to cart
        if (quantity > MAX_REGULAR_CHECKOUT_QUANTITY) {
          setQuantity(MAX_REGULAR_CHECKOUT_QUANTITY);
        }
        setShowCartSuccessModal(true);
      } finally {
        setAddingToCart(false);
      }
    }
  };

  // Handle 3D Products
  const handle3DProducts = () => {
    navigate(`/3d-products/${slug}`);
  };

  // Loading state
  if (loading) {
    return (
      <PageLoader isLoading={true} text="Loading product details..." />
    );
  }

  // Error state
  if (error || !product) {
    return (
      <div className="product-detail-page">
        <div className="pdp-container">
          <div className="error-message">
            <h2>Oops! Product not found</h2>
            <p>{error || 'The product you requested could not be found.'}</p>
            <Link to="/products" className="btn-primary">
              Browse All Products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const allImages = galleryImages;
  const thumbStripImages = allImages.slice(1, 5);

  const currentImage = allImages[selectedImageIndex] || '/logo192.png';
  const imageUrl = getImageUrl(currentImage);

  // Calculate pricing - use variation price if selected, otherwise use product price
  const basePrice = selectedVariation && selectedVariation.price > 0 
    ? selectedVariation.price 
    : (product.price || product.Price || 0);
  
  const hasDiscount = product.hasDiscount && product.discountInfo;
  const displayPrice = hasDiscount ? product.discountInfo.discountedPrice : basePrice;
  const originalPrice = hasDiscount ? basePrice : null;
  const variationStockSum = variations.length
    ? variations.reduce((sum, v) => {
        const q =
          variationAvailableById[v.id] !== undefined
            ? variationAvailableById[v.id]
            : Number(v.quantity) || 0;
        return sum + q;
      }, 0)
    : Number(product?.variationStockSum ?? product?.availableStock ?? 0) || 0;

  const stockQuantity = hasVariations
    ? (selectedVariation
        ? (availableStock !== null
            ? availableStock
            : (variationAvailableById[selectedVariation.id] !== undefined
                ? variationAvailableById[selectedVariation.id]
                : (selectedVariation.quantity || 0)))
        : variationStockSum)
    : (availableStock !== null ? availableStock : (product.stockQuantity || 0));

  const isInStock = hasVariations
    ? (selectedVariation ? (stockQuantity > 0) : variationStockSum > 0)
    : stockQuantity > 0;
  const isLowStock = stockQuantity > 0 && stockQuantity <= 10;
  const canPurchase = hasVariations ? Boolean(selectedVariation?.id) && stockQuantity > 0 : isInStock;

  const additionalInfoStockLabel = (() => {
    if (hasVariations) {
      if (selectedVariation) {
        if (stockQuantity <= 0) return 'Out of Stock';
        return isLowStock ? `Low Stock (${stockQuantity} available)` : 'In Stock';
      }
      return variationStockSum > 0 ? 'In Stock — select a variation' : 'Out of Stock';
    }
    if (!isInStock) return 'Out of Stock';
    return isLowStock ? `Low Stock (${stockQuantity} available)` : 'In Stock';
  })();

  const additionalInfoColors =
    (Array.isArray(product?.colors) && product.colors.length > 0)
      ? product.colors.join(', ')
      : (selectedVariation?.color || product?.color || 'N/A');

  const additionalInfoMaterial =
    product?.material
    || (Array.isArray(product?.materials) && product.materials.length > 0
      ? product.materials.join(', ')
      : 'N/A');

  // Breadcrumb items
  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products' },
    { label: product.name }
  ];

  const handleVariationSelect = (variation) => {
    if (selectedVariation?.id === variation.id) {
      setSelectedVariation(null);
      setVariationRequiredMessage('');
      setSelectedImageIndex(0);
      return;
    }
    setSelectedVariation(variation);
    setVariationRequiredMessage('');
    setSelectedImageIndex(0);
  };

  // Handle wishlist toggle
  const handleWishlistToggle = () => {
    if (product) {
      toggleWishlist(product);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  // Generate structured data for SEO
  const structuredData = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product?.name,
    "description": product?.description,
    "sku": product?.sku || "FRNC87654ABC",
    "category": product?.categoryName,
    "brand": {
      "@type": "Brand",
      "name": "DesignXcel"
    },
    "offers": {
      "@type": "Offer",
      "url": window.location.href,
      "priceCurrency": "PHP",
      "price": displayPrice,
      "availability": isInStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "seller": {
        "@type": "Organization",
        "name": "DesignXcel"
      }
    },
    "aggregateRating": product?.rating > 0 ? {
      "@type": "AggregateRating",
      "ratingValue": product.rating,
      "reviewCount": product.reviews || 0
    } : undefined,
    "image": allImages.map(img => img.startsWith('/') ? `${window.location.origin}${img}` : img)
  };

  return (
    <div className="product-detail-page">
      {/* Structured Data for SEO */}
      <script 
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      
      <div className="pdp-container">
        <Breadcrumb items={breadcrumbItems} />
        
        <div className="pdp">
          {/* Gallery Section */}
          <div className="pdp-gallery">
            <div className="pdp-gallery-main">
              <img 
                src={imageUrl} 
                alt={product.name}
                loading="eager"
                fetchpriority="high"
                width={1200}
                height={500}
                sizes="(max-width: 768px) 100vw, 600px"
                onError={(e) => {
                  e.target.src = '/logo192.png';
                }}
              />
              
              {/* Navigation arrows - Always show for 4 thumbnails */}
              <button 
                className="nav-arrow nav-arrow-left"
                onClick={() => handleImageNavigation('prev')}
                aria-label="Previous image"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15,18 9,12 15,6"/>
                </svg>
              </button>
              <button 
                className="nav-arrow nav-arrow-right"
                onClick={() => handleImageNavigation('next')}
                aria-label="Next image"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9,18 15,12 9,6"/>
                </svg>
              </button>
            </div>

            {/* Thumbnails - Show exactly 4 thumbnails */}
            <div className="pdp-thumbs">
              {Array.from({ length: 4 }, (_, index) => {
                const image = thumbStripImages[index] || null;
                const thumbUrl = image ? getImageUrl(image) : null;
                const isActive = (index + 1) === selectedImageIndex;
                const hasImage = !!image;
                
                return (
                  <div 
                    key={index}
                    className={`pdp-thumb ${isActive ? 'active' : ''} ${!hasImage ? 'placeholder' : ''}`}
                    onClick={() => setSelectedImageIndex(index + 1)}
                  >
                    {hasImage ? (
                      <img 
                        src={thumbUrl} 
                        alt={`${product.name} thumbnail ${index + 1}`}
                        loading="lazy"
                        fetchpriority="low"
                        onError={(e) => {
                          e.target.src = '/logo192.png';
                        }}
                      />
                    ) : (
                      <div className="thumbnail-placeholder">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21,15 16,10 5,21"/>
                        </svg>
                        <span>Thumbnail {index + 1}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Product Info Section */}
          <div className="pdp-info">
            {/* Category */}
            <div className="pdp-category">{product.categoryName}</div>
            
            {/* Title with Stock Status */}
            <div className="pdp-title-row">
              <h1 className="pdp-title">{product.name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {hasVariations && !selectedVariation ? (
                  <span className={`stock-badge ${variationStockSum > 0 ? 'select-option' : 'out-of-stock'}`}>
                    {variationStockSum > 0 ? 'Select an option' : 'Out of Stock'}
                  </span>
                ) : stockQuantity > 0 ? (
                  <span className={`stock-badge ${isLowStock ? 'low-stock' : 'in-stock'}`}>
                    {isLowStock ? `Only ${stockQuantity} available` : `${stockQuantity} in stock`}
                  </span>
                ) : (
                  <span className="stock-badge out-of-stock">Out of Stock</span>
                )}
              </div>
            </div>

            {/* Rating */}
            {product.rating > 0 && (
              <div className="pdp-rating">
                <div className="stars">
                  {[...Array(5)].map((_, i) => (
                    <svg 
                      key={i}
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill={i < Math.floor(product.rating) ? "#F4B400" : "#E0E0E0"}
                    >
                      <path d="M12 2l2.9 6.1 6.7.9-4.8 4.6 1.2 6.6L12 17.8 6 20.2l1.2-6.6L2.4 9l6.7-.9L12 2z"/>
                    </svg>
                  ))}
                </div>
                <span className="rating-text">
                  {product.rating.toFixed(1)} ({product.reviews || 245} Review)
                </span>
              </div>
            )}

            {/* Pricing */}
            <div className="pdp-pricing">
              <div className="price-main">
                <span className="price-current">{formatPrice(displayPrice)}</span>
                {originalPrice && (
                  <span className="price-original">{formatPrice(originalPrice)}</span>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="pdp-description">
              <p>{product.description || 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna'}</p>
            </div>

            {hasVariations && (
              <section className="pdp-variations-section" aria-label="Product options">
                <h2 className="pdp-variations-heading">
                  Choose an option <span className="required-asterisk">*</span>
                </h2>
                {variationRequiredMessage && (
                  <p className="variation-required-message">{variationRequiredMessage}</p>
                )}
                <div className="variation-cards-container">
                {variations.map((variation) => {
                  const sellableQty =
                    variationAvailableById[variation.id] !== undefined
                      ? variationAvailableById[variation.id]
                      : Number(variation.quantity) || 0;
                  return (
                  <div
                    key={variation.id}
                    className={`variation-card ${selectedVariation?.id === variation.id ? 'selected' : ''}`}
                    onClick={() => handleVariationSelect(variation)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleVariationSelect(variation);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    title={selectedVariation?.id === variation.id ? 'Click again to clear selection' : 'Select this option'}
                  >
                    {variation.imageUrl && (
                      <div className="variation-image">
                        <img src={getImageUrl(variation.imageUrl)} alt={variation.name} />
                      </div>
                    )}
                    <div className="variation-info">
                      <h4>{variation.name}</h4>
                      {variation.color && (
                        <div className="variation-color">
                          <span className="color-label">Color:</span>
                          <span className="color-value">{variation.color}</span>
                        </div>
                      )}
                      <div className="variation-quantity">
                        <span className="quantity-label">Available:</span>
                        <span className={`quantity-value ${sellableQty > 0 ? 'in-stock' : 'out-of-stock'}`}>
                          {sellableQty > 0 ? sellableQty : 'Out of Stock'}
                        </span>
                      </div>
                    </div>
                  </div>
                  );
                })}
                </div>
              </section>
            )}


            <div className="pdp-actions">
              <div className="quantity-selector">
                <button 
                  className="qty-btn qty-minus"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  -
                </button>
                <span className="qty-value">{quantity}</span>
                <button 
                  className="qty-btn qty-plus"
                  onClick={() => {
                    const productWithVariation = {
                      ...product,
                      useOriginalProduct: !hasVariations,
                      selectedVariation: hasVariations ? selectedVariation : null,
                      hasVariations
                    };
                    const maxAllowed = Math.min(
                      stockQuantity,
                      getMaxQuantityForProduct(productWithVariation),
                      MAX_REGULAR_CHECKOUT_QUANTITY
                    );
                    
                    // If quantity is already at max (9), check stock before showing bulk order modal
                    if (quantity >= MAX_REGULAR_CHECKOUT_QUANTITY) {
                      // Check if product has enough stock for bulk order (minimum 10)
                      if (stockQuantity < 10) {
                        setInsufficientStockMessage(`This product does not have enough stock for bulk orders. Available stock: ${stockQuantity}. Minimum required: 10 items.`);
                        setShowInsufficientStockModal(true);
                        return;
                      }
                      setShowBulkOrderModal(true);
                    } else {
                      setQuantity(Math.min(maxAllowed, quantity + 1));
                    }
                  }}
                  disabled={
                    // Disable only if we've reached stock/cart limits AND quantity is below 9
                    // At quantity 9, button should be enabled to show bulk order modal
                    quantity >= Math.min(
                      stockQuantity,
                      getMaxQuantityForProduct({
                        ...product,
                        useOriginalProduct: !hasVariations,
                        selectedVariation: hasVariations ? selectedVariation : null,
                        hasVariations
                      })
                    ) && quantity < MAX_REGULAR_CHECKOUT_QUANTITY
                  }
                >
                  +
                </button>
              </div>
              
              <button 
                className="btn-add-cart"
                onClick={handleAddToCart}
                disabled={!canPurchase || addingToCart}
              >
                {addingToCart ? 'Adding...' : (hasVariations && !selectedVariation ? 'Select an option' : 'Add To Cart')}
              </button>

              {/* Only show 3D Products button if product has a 3D model */}
              {(selectedVariation?.model3d || product.model3d || product.model3DURL || product.has3dModel || product.has3DModel) && (
                <button 
                  className="btn-buy-now" 
                  onClick={handle3DProducts}
                  disabled={!canPurchase}
                >
                  3D Products
                </button>
              )}
              
              <button 
                className={`wishlist-btn ${isInWishlist(product?.id) ? 'in-wishlist' : ''}`}
                onClick={handleWishlistToggle}
                aria-label={isInWishlist(product?.id) ? "Remove from wishlist" : "Add to wishlist"}
                title={isInWishlist(product?.id) ? "Remove from wishlist" : "Add to wishlist"}
              >
                <svg 
                  width="20" 
                  height="20" 
                  viewBox="0 0 24 24" 
                  fill={isInWishlist(product?.id) ? "#F0B21B" : "none"} 
                  stroke={isInWishlist(product?.id) ? "#F0B21B" : "currentColor"} 
                  strokeWidth="2"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
            </div>

            {/* Product Details */}
            <div className="pdp-details">
              <div>Category : {product.categoryName}</div>
            </div>

            {/* Share Options */}
            <div className="share-section">
              <span className="share-label">Share :</span>
              <div className="social-icons">
                <a 
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}&quote=${encodeURIComponent(`Check out this amazing ${product.name} from Design Excellence! ${product.description ? product.description.substring(0, 100) + '...' : ''} #DesignExcellence #OfficeFurniture`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-btn facebook" 
                  aria-label="Share on Facebook"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
                <a 
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(`🏢 Check out this amazing ${product.name} from @DesignExcellence! ${product.description ? product.description.substring(0, 80) + '...' : ''} #OfficeFurniture #DesignExcellence`)}&hashtags=OfficeFurniture,DesignExcellence`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-btn twitter" 
                  aria-label="Share on Twitter"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                  </svg>
                </a>
                <a 
                  href={`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(window.location.href)}&media=${encodeURIComponent(getImageUrl(product.images?.[0] || product.thumbnails?.[0] || ''))}&description=${encodeURIComponent(`${product.name} - ${product.description ? product.description.substring(0, 200) : 'Premium office furniture from Design Excellence'} #DesignExcellence #OfficeFurniture`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-btn pinterest" 
                  aria-label="Share on Pinterest"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.174-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.402.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.357-.629-2.748-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24.009 12.017 24.009c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001.012.001z"/>
                  </svg>
                </a>
                <a 
                  href={`https://wa.me/?text=${encodeURIComponent(`Check out this amazing ${product.name} from Design Excellence! ${window.location.href} #DesignExcellence #OfficeFurniture`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-btn whatsapp" 
                  aria-label="Share on WhatsApp"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                  </svg>
                </a>
                <a 
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-btn linkedin" 
                  aria-label="Share on LinkedIn"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
                <a 
                  href="https://www.instagram.com/designexcellence01/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-btn instagram" 
                  aria-label="Follow us on Instagram"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
                <button 
                  onClick={handleCopyLink}
                  className="social-btn copy-link" 
                  aria-label="Copy product link"
                  title={linkCopied ? "Link copied!" : "Copy link"}
                >
                  {linkCopied ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Information Section */}
      <div className="additional-info-section">
        <div className="info-tabs">
          <button 
            className={`info-tab ${activeTab === 'description' ? 'active' : ''}`}
            onClick={() => setActiveTab('description')}
          >
            Description
          </button>
          <button 
            className={`info-tab ${activeTab === 'additional-info' ? 'active' : ''}`}
            onClick={() => setActiveTab('additional-info')}
          >
            Additional Information
          </button>
          <button 
            className={`info-tab ${activeTab === 'review' ? 'active' : ''}`}
            onClick={() => setActiveTab('review')}
          >
            Review
          </button>
        </div>
        
        <div className="info-content">
          {activeTab === 'description' && (
            <div className="description-content">
              <div className="description-text">
                {product?.description || product?.longDescription || (
                  <div>
                    <p>Experience the perfect blend of comfort and style with our premium furniture collection. This exceptional piece combines modern design with superior craftsmanship to create a timeless addition to your space.</p>
                    
                    <h4>Key Features:</h4>
                    <ul>
                      <li>Premium quality materials for lasting durability</li>
                      <li>Ergonomic design for maximum comfort</li>
                      <li>Modern aesthetic that complements any decor</li>
                      <li>Easy assembly with detailed instructions</li>
                      <li>Professional finish with attention to detail</li>
                    </ul>
                    
                    <h4>Perfect For:</h4>
                    <p>Whether you're furnishing your home office, living room, or bedroom, this piece offers versatile functionality and timeless appeal. Its neutral design ensures it will remain stylish for years to come.</p>
                    
                    <h4>Care Instructions:</h4>
                    <p>Clean with a soft, dry cloth. Avoid harsh chemicals and direct sunlight to maintain the finish. Regular dusting will keep your furniture looking its best.</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {activeTab === 'additional-info' && (
            <div className="info-table-container">
              <table className="info-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Product Name</td>
                    <td>{product?.name || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td>Category</td>
                    <td>{product?.categoryName || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td>Brand</td>
                    <td>{product?.brand || 'DesignXcel'}</td>
                  </tr>
                  <tr>
                    <td>SKU</td>
                    <td>
                      {hasVariations
                        ? (selectedVariation?.sku || (selectedVariation?.id ? '—' : 'Select a variation'))
                        : (product?.sku || 'N/A')}
                    </td>
                  </tr>

                  <tr>
                    <td>Material</td>
                    <td>{additionalInfoMaterial}</td>
                  </tr>
                  <tr>
                    <td>Color Options</td>
                    <td>{additionalInfoColors}</td>
                  </tr>
                  <tr>
                    <td>Stock Status</td>
                    <td>{additionalInfoStockLabel}</td>
                  </tr>
                  <tr>
                    <td>Price</td>
                    <td>
                      {product ? (
                        <>
                          {formatPrice(displayPrice)}
                          {originalPrice != null && originalPrice !== displayPrice && (
                            <span style={{ marginLeft: '8px', textDecoration: 'line-through', opacity: 0.65 }}>
                              {formatPrice(originalPrice)}
                            </span>
                          )}
                        </>
                      ) : 'N/A'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          
          {activeTab === 'review' && (
            <div className="review-content">
              <div className="review-tab-header">
                <div className="tab-header-content">
                  <h3 className="review-header-title">Customer Reviews & Ratings</h3>
                </div>
              </div>
              <ReviewSection 
                productId={product?.id} 
                productName={product?.name || 'Product'}
                orderId={orderId}
              />
            </div>
          )}
        </div>
      </div>

      {/* Cart Success Modal */}
      <CartSuccessModal
        isOpen={showCartSuccessModal}
        onClose={() => setShowCartSuccessModal(false)}
        product={{
          ...product,
          // Use variation price if selected, otherwise use product price
          price: selectedVariation && selectedVariation.price > 0 
            ? selectedVariation.price 
            : (product.price || product.Price || 0),
          // Include variation name if selected
          name: selectedVariation 
            ? `${product.name} - ${selectedVariation.name}`
            : product.name,
          // Use variation image if available, otherwise use product image
          images: selectedVariation && selectedVariation.imageUrl
            ? [selectedVariation.imageUrl, ...(product.images || product.thumbnails || []).slice(1)]
            : product.images || product.thumbnails || [product.image]
        }}
        quantity={quantity}
        onContinueShopping={() => setShowCartSuccessModal(false)}
        onViewCart={() => navigate('/cart')}
      />
      
      {/* Bulk Order Confirmation Modal */}
      <ConfirmationModal
        isOpen={showBulkOrderModal}
        onClose={() => setShowBulkOrderModal(false)}
        onConfirm={() => {
          setShowBulkOrderModal(false);
          handleAddToBulkOrder();
        }}
        title="Bulk Order Required"
        message={`You've reached the maximum quantity (${MAX_REGULAR_CHECKOUT_QUANTITY}) for regular checkout. For quantities of ${MAX_REGULAR_CHECKOUT_QUANTITY + 1} or more, please use our bulk order system. Would you like to proceed to the bulk order page?`}
        confirmText="Go to Bulk Order"
        cancelText="Cancel"
        type="info"
      />
      
      {/* Insufficient Stock Modal */}
      <ConfirmationModal
        isOpen={showInsufficientStockModal}
        onClose={() => setShowInsufficientStockModal(false)}
        onConfirm={() => setShowInsufficientStockModal(false)}
        title="Insufficient Stock for Bulk Order"
        message={insufficientStockMessage}
        confirmText="OK"
        type="warning"
      />
      
    </div>
  );
};

export default ProductDetail;
