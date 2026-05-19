import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../../shared/contexts/CartContext';
import { useCurrency } from '../../../shared/contexts/CurrencyContext';
import CartItem from '../components/CartItem';
import ConfirmationModal from '../../../shared/components/ui/ConfirmationModal';
import PageHeader from '../../../shared/components/layout/PageHeader';
import '../components/cart.css';
import { 
  ShoppingCartIcon, 
  ShoppingBagIcon
} from '../../../shared/components/ui/SvgIcons';
import '../components/cart-discounts.css';

const Cart = () => {
    const navigate = useNavigate();
    const { items, updateQuantity, removeFromCart, clearCart, CART_LIMITS, lastError } = useCart();
    const { formatPrice } = useCurrency();
    const [showClearConfirmation, setShowClearConfirmation] = useState(false);
    const [showRemoveModal, setShowRemoveModal] = useState(false);
    const [itemToRemove, setItemToRemove] = useState(null);
    const [showBulkOrderModal, setShowBulkOrderModal] = useState(false);
    const [itemIdForBulkOrder, setItemIdForBulkOrder] = useState(null);
    const [showInsufficientStockModal, setShowInsufficientStockModal] = useState(false);
    const [insufficientStockMessage, setInsufficientStockMessage] = useState('');
    
    // Maximum quantity for regular checkout
    const MAX_REGULAR_CHECKOUT_QUANTITY = 9;

    // Track checked state for each cart item
    const [checkedItems, setCheckedItems] = useState(() =>
      Object.fromEntries(items.map(item => [item.id, true]))
    );

    // Update checked state when items change
    useEffect(() => {
        // Update checked state for new items
        setCheckedItems(prev => {
            const newChecked = { ...prev };
            items.forEach(item => {
                if (!(item.id in newChecked)) {
                    newChecked[item.id] = true;
                }
            });
            return newChecked;
        });
    }, [items]);

    const handleCheck = (id, checked) => {
      setCheckedItems(prev => ({ ...prev, [id]: checked }));
    };

    // Handle adding cart item to bulk order and navigating
    const handleAddCartItemToBulkOrder = (itemId) => {
        const currentItem = items.find(item => item.id === itemId);
        if (currentItem) {
            try {
                const product = currentItem.product;
                const productId = String(product.id || product.ProductID);
                const imageUrl = product.images?.[0] || product.ImageURL || product.image || '';
                const currentQuantity = currentItem.quantity;
                
                const bulkOrderItem = {
                    id: `${productId}-${Date.now()}-${Math.random()}`,
                    productId: productId,
                    name: product.name || product.Name,
                    price: product.price || product.Price || 0,
                    quantity: Math.max(10, currentQuantity), // Ensure minimum 10
                    sku: product.sku || product.SKU || `SKU-${productId}`,
                    stockQuantity: product.stock || product.stockQuantity || 0,
                    image: imageUrl,
                    variationId: currentItem.variationId || null,
                    variationName: currentItem.variationName || null
                };
                
                // Get existing bulk order items
                const existingItems = JSON.parse(localStorage.getItem('bulkOrderItems') || '[]');
                
                // Check if product already exists in bulk order
                const existingIndex = existingItems.findIndex(item => 
                    String(item.productId) === String(productId) &&
                    item.variationId === bulkOrderItem.variationId
                );
                
                if (existingIndex >= 0) {
                    // Update existing item quantity
                    existingItems[existingIndex].quantity = Math.max(10, existingItems[existingIndex].quantity + currentQuantity);
                } else {
                    // Add new item
                    existingItems.push(bulkOrderItem);
                }
                
                // Save to localStorage
                localStorage.setItem('bulkOrderItems', JSON.stringify(existingItems));
                
                // Remove from cart
                removeFromCart(itemId);
                
                // Navigate to bulk order page
                navigate('/bulk-order');
            } catch (error) {
                console.error('Error adding to bulk order:', error);
                alert('Failed to add product to bulk order. Please try again.');
            }
        }
    };

    const handleQuantityChange = (itemId, newQuantity) => {
        if (newQuantity <= 0) {
            setItemToRemove(itemId);
            setShowRemoveModal(true);
        } else if (newQuantity >= 10) {
            // If quantity >= 10, check if product can accommodate bulk order
            const currentItem = items.find(item => item.id === itemId);
            if (currentItem) {
                const product = currentItem.product;
                const productStock = product.stock || product.stockQuantity || 0;
                
                // Check if product has enough stock for bulk order (minimum 10)
                if (productStock < 10) {
                    setInsufficientStockMessage(`This product does not have enough stock for bulk orders. Available stock: ${productStock}. Minimum required: 10 items.`);
                    setShowInsufficientStockModal(true);
                    // Reset quantity to max allowed (9)
                    updateQuantity(itemId, MAX_REGULAR_CHECKOUT_QUANTITY);
                    return;
                }
            }
            // If stock is sufficient, show bulk order modal
            setItemIdForBulkOrder(itemId);
            setShowBulkOrderModal(true);
        } else if (newQuantity > CART_LIMITS.MAX_QUANTITY_PER_PRODUCT) {
            // Silently prevent quantity update beyond limit
            return;
        } else {
            // Normal update (1-9)
            updateQuantity(itemId, newQuantity);
        }
    };

    const handleRemoveItem = () => {
        if (itemToRemove) {
            removeFromCart(itemToRemove);
            setItemToRemove(null);
        }
        setShowRemoveModal(false);
    };

    const handleClearCart = () => {
        clearCart();
        setShowClearConfirmation(false);
    };

    // Calculate values for only checked items
    const checkedCartItems = items.filter(item => checkedItems[item.id]);
    const subtotal = checkedCartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal;
    const totalQuantity = checkedCartItems.reduce((sum, item) => sum + item.quantity, 0);

    // Handler for checkout button
    const handleProceedToCheckout = () => {
      const checked = items.filter(item => checkedItems[item.id]);
      
      // Check if cart exceeds the different items limit
      if (checked.length > CART_LIMITS.MAX_DIFFERENT_ITEMS) {
        // Silently prevent checkout
        return;
      }
      
      // Check if any item exceeds the quantity limit
      const exceededItems = checked.filter(item => item.quantity > CART_LIMITS.MAX_QUANTITY_PER_PRODUCT);
      if (exceededItems.length > 0) {
        // Silently prevent checkout
        return;
      }
      
      navigate('/checkout', { state: { items: checked } });
    };

    if (items.length === 0) {
        return (
            <div className="cart-page">
                <div className="container">
                    <div className="cart-empty-page">
                        <div className="empty-cart-content">
                            <div className="empty-cart-icon">
                                <ShoppingCartIcon size={48} color="#F0B21B" />
                            </div>
                            <h1>Your Cart is Empty</h1>
                            <p>Looks like you haven't added any items to your cart yet.</p>
                            <div className="empty-cart-actions">
                                <button 
                                    className="browse-products-btn"
                                    onClick={() => navigate('/products')}
                                >
                                    <ShoppingBagIcon size={14} color="#ffffff" />
                                    Continue Shopping
                                </button>
                                <button 
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
            </div>
        );
    }

    return (
        <div className="cart-page">
            <div className="container">
                <PageHeader
                    breadcrumbs={[
                        { label: 'Home', href: '/' },
                        { label: 'Shopping Cart' }
                    ]}
                    title="Shopping Cart"
                    subtitle={`${items.length} ${items.length === 1 ? 'item' : 'items'} in your cart`}
                />

                <div className="cart-layout">
                    <div className="cart-main">
                        <div className="cart-items-header">
                            <h2>Items in Your Cart</h2>
                            <button
                                className="clear-cart-btn"
                                onClick={() => setShowClearConfirmation(true)}
                            >
                                Clear All
                            </button>
                        </div>

                        {/* Error Message */}
                        {lastError && (
                            <div className="cart-error-message">
                                {lastError}
                            </div>
                        )}

                        <div className="cart-table-header">
                            <div className="header-product">Product</div>
                            <div className="header-price">Price</div>
                            <div className="header-quantity">Quantity</div>
                            <div className="header-subtotal">Subtotal</div>
                        </div>

                        <div className="cart-items-list">
                            {items.map(item => (
                                <div key={item.id} className="cart-item-wrapper">
                                    <CartItem 
                                      item={item} 
                                      checked={checkedItems[item.id] ?? true}
                                      onCheck={handleCheck}
                                      onUpdateQuantity={handleQuantityChange}
                                      onRemove={(itemId) => {
                                          setItemToRemove(itemId);
                                          setShowRemoveModal(true);
                                      }}
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="cart-actions-bottom">
                            <Link to="/products" className="btn btn-secondary">
                                Continue Shopping
                            </Link>
                        </div>
                    </div>

                    <div className="cart-sidebar-summary">
                        <div className="cart-summary-card">
                            
                            <div className="summary-details">
                                <div className="summary-row total">
                                    <span>Total ({totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}):</span>
                                    <span>{formatPrice(total)}</span>
                                </div>
                            </div>

                            <div className="checkout-actions">
                                <button
                                    className="btn btn-primary btn-full btn-large"
                                    onClick={handleProceedToCheckout}
                                    disabled={items.filter(item => checkedItems[item.id]).length === 0}
                                >
                                    Proceed to Checkout
                                </button>

                                <div className="payment-methods">
                                    <p>We accept all major credit cards</p>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* Clear Cart Confirmation Modal */}
            <ConfirmationModal
                isOpen={showClearConfirmation}
                onClose={() => setShowClearConfirmation(false)}
                onConfirm={handleClearCart}
                title="Clear Shopping Cart"
                message="Are you sure you want to remove all items from your cart? This action cannot be undone."
                confirmText="Clear Cart"
                cancelText="Keep Items"
                type="warning"
            />

            {/* Remove Item Confirmation Modal */}
            <ConfirmationModal
                isOpen={showRemoveModal}
                onClose={() => setShowRemoveModal(false)}
                onConfirm={handleRemoveItem}
                title="Remove Item"
                message={`Are you sure you want to remove this item from your cart?`}
                confirmText="Remove"
                cancelText="Cancel"
                type="warning"
            />
            
            {/* Bulk Order Confirmation Modal */}
            <ConfirmationModal
                isOpen={showBulkOrderModal}
                onClose={() => {
                    setShowBulkOrderModal(false);
                    setItemIdForBulkOrder(null);
                }}
                onConfirm={() => {
                    if (itemIdForBulkOrder) {
                        handleAddCartItemToBulkOrder(itemIdForBulkOrder);
                    }
                    setShowBulkOrderModal(false);
                    setItemIdForBulkOrder(null);
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

export default Cart;
