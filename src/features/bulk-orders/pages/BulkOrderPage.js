import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../../shared/contexts/CurrencyContext';
import { getAllProducts, getCategories } from '../../products/services/productService';
import apiClient from '../../../shared/services/apiClient';
import PageHeader from '../../../shared/components/layout/PageHeader';
import Modal from '../../../shared/components/ui/Modal';
import { Bars } from 'react-loader-spinner';
import './BulkOrderPage.css';

const BulkOrderPage = () => {
    const navigate = useNavigate();
    const { formatPrice } = useCurrency();
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [bulkOrderItems, setBulkOrderItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showQuoteModal, setShowQuoteModal] = useState(false);
    const [quoteRequest, setQuoteRequest] = useState({
        companyName: '',
        contactName: '',
        email: '',
        phone: '',
        notes: ''
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        loadProducts();
        loadCategories();
    }, []);

    useEffect(() => {
        filterProducts();
    }, [products, searchTerm, selectedCategory]);

    const loadProducts = async () => {
        try {
            setLoading(true);
            const data = await getAllProducts();
            setProducts(data);
        } catch (error) {
            console.error('Error loading products:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadCategories = async () => {
        try {
            const data = await getCategories();
            setCategories(data);
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    };

    const filterProducts = () => {
        let filtered = [...products];

        if (searchTerm) {
            filtered = filtered.filter(p => 
                p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.description?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (selectedCategory) {
            filtered = filtered.filter(p => p.category === selectedCategory);
        }

        setFilteredProducts(filtered);
    };

    const addProductToBulkOrder = (product) => {
        const existingItem = bulkOrderItems.find(item => item.productId === product.productId);
        
        if (existingItem) {
            setBulkOrderItems(items =>
                items.map(item =>
                    item.productId === product.productId
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                )
            );
        } else {
            setBulkOrderItems([...bulkOrderItems, {
                productId: product.productId,
                name: product.name,
                price: product.price,
                quantity: 1,
                sku: product.sku || `SKU-${product.productId}`,
                stockQuantity: product.stockQuantity || 0,
                image: product.imageUrl || product.thumbnail1
            }]);
        }
    };

    const updateQuantity = (productId, quantity) => {
        if (quantity <= 0) {
            removeItem(productId);
        } else {
            setBulkOrderItems(items =>
                items.map(item =>
                    item.productId === productId
                        ? { ...item, quantity: parseInt(quantity) || 1 }
                        : item
                )
            );
        }
    };

    const removeItem = (productId) => {
        setBulkOrderItems(items => items.filter(item => item.productId !== productId));
    };

    const clearBulkOrder = () => {
        if (window.confirm('Are you sure you want to clear all items from the bulk order?')) {
            setBulkOrderItems([]);
        }
    };

    const calculateVolumeDiscount = (quantity) => {
        // Volume discount tiers (customize based on your business needs)
        if (quantity >= 100) return 0.20; // 20% off for 100+
        if (quantity >= 50) return 0.15;  // 15% off for 50+
        if (quantity >= 25) return 0.10;   // 10% off for 25+
        if (quantity >= 10) return 0.05;  // 5% off for 10+
        return 0;
    };

    const calculateItemTotal = (item) => {
        const discount = calculateVolumeDiscount(item.quantity);
        const discountedPrice = item.price * (1 - discount);
        return {
            unitPrice: discountedPrice,
            total: discountedPrice * item.quantity,
            discount: discount,
            savings: item.price * item.quantity * discount
        };
    };

    const calculateGrandTotal = () => {
        return bulkOrderItems.reduce((total, item) => {
            const itemTotal = calculateItemTotal(item);
            return total + itemTotal.total;
        }, 0);
    };

    const calculateTotalSavings = () => {
        return bulkOrderItems.reduce((total, item) => {
            const itemTotal = calculateItemTotal(item);
            return total + itemTotal.savings;
        }, 0);
    };

    const calculateTotalQuantity = () => {
        return bulkOrderItems.reduce((total, item) => total + item.quantity, 0);
    };

    const handleSubmitOrder = async () => {
        if (bulkOrderItems.length === 0) {
            alert('Please add items to your bulk order');
            return;
        }

        setSubmitting(true);
        try {
            const orderData = {
                items: bulkOrderItems.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: item.price,
                    name: item.name,
                    sku: item.sku
                })),
                totals: {
                    subtotal: bulkOrderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
                    discount: calculateTotalSavings(),
                    total: calculateGrandTotal(),
                    totalQuantity: calculateTotalQuantity()
                },
                volumeDiscounts: bulkOrderItems.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    discount: calculateVolumeDiscount(item.quantity)
                }))
            };

            const response = await apiClient.post('/api/bulk-orders', orderData);
            
            setSuccessMessage('Your bulk order has been submitted successfully! Our team will contact you shortly.');
            setShowSuccessModal(true);
            setBulkOrderItems([]);
        } catch (error) {
            console.error('Error submitting bulk order:', error);
            alert('Failed to submit bulk order. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRequestQuote = async () => {
        if (bulkOrderItems.length === 0) {
            alert('Please add items to request a quote');
            return;
        }

        setSubmitting(true);
        try {
            const quoteData = {
                ...quoteRequest,
                items: bulkOrderItems.map(item => ({
                    productId: item.productId,
                    name: item.name,
                    quantity: item.quantity,
                    unitPrice: item.price,
                    sku: item.sku
                })),
                estimatedTotal: calculateGrandTotal(),
                totalQuantity: calculateTotalQuantity()
            };

            const response = await apiClient.post('/api/bulk-orders/request-quote', quoteData);
            
            setSuccessMessage('Your quote request has been submitted! Our sales team will contact you within 24 hours.');
            setShowSuccessModal(true);
            setShowQuoteModal(false);
            setQuoteRequest({
                companyName: '',
                contactName: '',
                email: '',
                phone: '',
                notes: ''
            });
        } catch (error) {
            console.error('Error requesting quote:', error);
            alert('Failed to submit quote request. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const exportToCSV = () => {
        if (bulkOrderItems.length === 0) {
            alert('No items to export');
            return;
        }

        const csvContent = [
            ['Product Name', 'SKU', 'Quantity', 'Unit Price', 'Total Price', 'Discount %', 'Savings'],
            ...bulkOrderItems.map(item => {
                const itemTotal = calculateItemTotal(item);
                return [
                    item.name,
                    item.sku,
                    item.quantity,
                    formatPrice(item.price),
                    formatPrice(itemTotal.total),
                    `${(itemTotal.discount * 100).toFixed(0)}%`,
                    formatPrice(itemTotal.savings)
                ];
            })
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bulk-order-${Date.now()}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="bulk-order-loading">
                <Bars height="50" width="50" color="#3b82f6" />
                <p>Loading products...</p>
            </div>
        );
    }

    return (
        <div className="bulk-order-page">
            <PageHeader 
                title="Bulk Order" 
                subtitle="Order multiple items at volume discounts"
            />

            <div className="bulk-order-container">
                <div className="bulk-order-layout">
                    {/* Left Panel - Product Search */}
                    <div className="bulk-order-products-panel">
                        <div className="bulk-order-search-section">
                            <h3>Add Products to Bulk Order</h3>
                            
                            <div className="search-filters">
                                <input
                                    type="text"
                                    placeholder="Search products..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="search-input"
                                />
                                
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="category-select"
                                >
                                    <option value="">All Categories</option>
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="products-grid">
                                {filteredProducts.length === 0 ? (
                                    <p className="no-products">No products found</p>
                                ) : (
                                    filteredProducts.map(product => (
                                        <div key={product.productId} className="product-card-mini">
                                            <div className="product-image-mini">
                                                <img 
                                                    src={product.imageUrl || product.thumbnail1 || '/logo.png'} 
                                                    alt={product.name}
                                                />
                                            </div>
                                            <div className="product-info-mini">
                                                <h4>{product.name}</h4>
                                                <p className="product-price">{formatPrice(product.price)}</p>
                                                <p className="product-stock">
                                                    Stock: {product.stockQuantity || 0}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => addProductToBulkOrder(product)}
                                                className="add-to-bulk-btn"
                                                disabled={!product.stockQuantity || product.stockQuantity === 0}
                                            >
                                                Add to Bulk Order
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - Bulk Order Summary */}
                    <div className="bulk-order-summary-panel">
                        <div className="bulk-order-header">
                            <h3>Bulk Order Summary</h3>
                            {bulkOrderItems.length > 0 && (
                                <button onClick={clearBulkOrder} className="clear-btn">
                                    Clear All
                                </button>
                            )}
                        </div>

                        {bulkOrderItems.length === 0 ? (
                            <div className="empty-bulk-order">
                                <p>No items in bulk order</p>
                                <p className="hint">Add products from the left panel to get started</p>
                            </div>
                        ) : (
                            <>
                                <div className="bulk-order-table-container">
                                    <table className="bulk-order-table">
                                        <thead>
                                            <tr>
                                                <th>Product</th>
                                                <th>SKU</th>
                                                <th>Qty</th>
                                                <th>Unit Price</th>
                                                <th>Discount</th>
                                                <th>Total</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bulkOrderItems.map(item => {
                                                const itemTotal = calculateItemTotal(item);
                                                return (
                                                    <tr key={item.productId}>
                                                        <td>
                                                            <div className="product-cell">
                                                                {item.image && (
                                                                    <img src={item.image} alt={item.name} />
                                                                )}
                                                                <span>{item.name}</span>
                                                            </div>
                                                        </td>
                                                        <td>{item.sku}</td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                value={item.quantity}
                                                                onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value))}
                                                                className="quantity-input"
                                                            />
                                                        </td>
                                                        <td>{formatPrice(item.price)}</td>
                                                        <td>
                                                            <span className="discount-badge">
                                                                {(itemTotal.discount * 100).toFixed(0)}%
                                                            </span>
                                                        </td>
                                                        <td className="total-cell">
                                                            {formatPrice(itemTotal.total)}
                                                            {itemTotal.savings > 0 && (
                                                                <span className="savings">
                                                    Save {formatPrice(itemTotal.savings)}
                                                </span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <button
                                                                onClick={() => removeItem(item.productId)}
                                                                className="remove-btn"
                                                            >
                                                                Remove
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="bulk-order-totals">
                                    <div className="totals-row">
                                        <span>Total Items:</span>
                                        <span>{bulkOrderItems.length}</span>
                                    </div>
                                    <div className="totals-row">
                                        <span>Total Quantity:</span>
                                        <span>{calculateTotalQuantity()}</span>
                                    </div>
                                    <div className="totals-row">
                                        <span>Subtotal:</span>
                                        <span>
                                            {formatPrice(
                                                bulkOrderItems.reduce((sum, item) => 
                                                    sum + (item.price * item.quantity), 0
                                                )
                                            )}
                                        </span>
                                    </div>
                                    {calculateTotalSavings() > 0 && (
                                        <div className="totals-row savings-row">
                                            <span>Volume Discount Savings:</span>
                                            <span className="savings-amount">
                                                -{formatPrice(calculateTotalSavings())}
                                            </span>
                                        </div>
                                    )}
                                    <div className="totals-row grand-total">
                                        <span>Grand Total:</span>
                                        <span>{formatPrice(calculateGrandTotal())}</span>
                                    </div>
                                </div>

                                <div className="bulk-order-actions">
                                    <button onClick={exportToCSV} className="export-btn">
                                        Export to CSV
                                    </button>
                                    <button 
                                        onClick={() => setShowQuoteModal(true)} 
                                        className="quote-btn"
                                    >
                                        Request Quote
                                    </button>
                                    <button 
                                        onClick={handleSubmitOrder} 
                                        className="submit-btn"
                                        disabled={submitting}
                                    >
                                        {submitting ? 'Submitting...' : 'Submit Bulk Order'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Quote Request Modal */}
            <Modal
                isOpen={showQuoteModal}
                onClose={() => setShowQuoteModal(false)}
                title="Request Custom Quote"
            >
                <div className="quote-form">
                    <p className="quote-description">
                        Fill out the form below and our sales team will provide you with a custom quote within 24 hours.
                    </p>
                    
                    <div className="form-group">
                        <label>Company Name *</label>
                        <input
                            type="text"
                            value={quoteRequest.companyName}
                            onChange={(e) => setQuoteRequest({...quoteRequest, companyName: e.target.value})}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Contact Name *</label>
                        <input
                            type="text"
                            value={quoteRequest.contactName}
                            onChange={(e) => setQuoteRequest({...quoteRequest, contactName: e.target.value})}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Email *</label>
                        <input
                            type="email"
                            value={quoteRequest.email}
                            onChange={(e) => setQuoteRequest({...quoteRequest, email: e.target.value})}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Phone *</label>
                        <input
                            type="tel"
                            value={quoteRequest.phone}
                            onChange={(e) => setQuoteRequest({...quoteRequest, phone: e.target.value})}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Additional Notes</label>
                        <textarea
                            value={quoteRequest.notes}
                            onChange={(e) => setQuoteRequest({...quoteRequest, notes: e.target.value})}
                            rows="4"
                            placeholder="Any special requirements or delivery instructions..."
                        />
                    </div>

                    <div className="quote-summary">
                        <h4>Quote Summary:</h4>
                        <p>Total Items: {bulkOrderItems.length}</p>
                        <p>Total Quantity: {calculateTotalQuantity()}</p>
                        <p>Estimated Total: {formatPrice(calculateGrandTotal())}</p>
                    </div>

                    <div className="modal-actions">
                        <button onClick={() => setShowQuoteModal(false)} className="cancel-btn">
                            Cancel
                        </button>
                        <button 
                            onClick={handleRequestQuote} 
                            className="submit-quote-btn"
                            disabled={submitting || !quoteRequest.companyName || !quoteRequest.email || !quoteRequest.phone}
                        >
                            {submitting ? 'Submitting...' : 'Submit Quote Request'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Success Modal */}
            <Modal
                isOpen={showSuccessModal}
                onClose={() => {
                    setShowSuccessModal(false);
                    navigate('/products');
                }}
                title="Success!"
            >
                <div className="success-message">
                    <p>{successMessage}</p>
                    <button 
                        onClick={() => {
                            setShowSuccessModal(false);
                            navigate('/products');
                        }}
                        className="success-btn"
                    >
                        Continue Shopping
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default BulkOrderPage;

