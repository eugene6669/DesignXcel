import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useCurrency } from '../../../shared/contexts/CurrencyContext';
import apiClient from '../../../shared/services/api/apiClient';
import PageHeader from '../../../shared/components/layout/PageHeader';
import Modal from '../../../shared/components/ui/Modal';
import ConfirmationModal from '../../../shared/components/ui/ConfirmationModal';
import AudioLoader from '../../../shared/components/ui/AudioLoader';
import { getAllProducts, getCategories, searchProducts } from '../../products/services/productService';
import { getPrimaryImageUrl } from '../../../shared/utils/imageUtils';
import stripeService from '../../checkout/services/stripeService';
import './BulkOrderPage.css';

const BulkOrderPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, isAuthenticated, loading: authLoading } = useAuth();
    const { formatPrice } = useCurrency();
    const [bulkOrderItems, setBulkOrderItems] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showConfirmationModal, setShowConfirmationModal] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    const [showQuantityModal, setShowQuantityModal] = useState(false);
    const [quantityModalMessage, setQuantityModalMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [pickupDateTime, setPickupDateTime] = useState('');
    
    // Fetch available stock for a product
    const fetchAvailableStock = async (productId) => {
        try {
            const response = await apiClient.get(`/api/products/${productId}/available-stock`);
            if (response.success) {
                return response.availableStock;
            }
        } catch (error) {
            console.error('Error fetching available stock:', error);
        }
        return null;
    };
    
    // Load bulk order items from localStorage on mount
    useEffect(() => {
        // Don't load if we've already checked out (to prevent reloading after checkout)
        if (hasCheckedOut.current) {
            console.log('[BULK ORDER] Skipping load - hasCheckedOut flag is true');
            // Ensure state is empty if checkout flag is set
            if (bulkOrderItems.length > 0) {
                setBulkOrderItemsDeduplicated([]);
                setPickupDateTime('');
            }
            return;
        }
        
        if (isAuthenticated && !authLoading && !hasLoadedFromStorage.current) {
            try {
                const savedItems = localStorage.getItem('bulkOrderItems');
                const savedPickupDateTime = localStorage.getItem('bulkOrderPickupDateTime');
                
                // Double-check: if localStorage is empty, don't load anything
                if (!savedItems) {
                    console.log('[BULK ORDER] No saved items in localStorage, keeping state empty');
                    hasLoadedFromStorage.current = true;
                    return;
                }
                
                if (savedItems) {
                    const parsedItems = JSON.parse(savedItems);
                    // Only set if we have valid items
                    if (Array.isArray(parsedItems) && parsedItems.length > 0) {
                        // Use deduplication wrapper
                        setBulkOrderItemsDeduplicated(parsedItems); 
                    }
                }
                
                if (savedPickupDateTime) {
                    setPickupDateTime(savedPickupDateTime);
                }
                
                hasLoadedFromStorage.current = true;
            } catch (error) {
                console.error('Error loading bulk order from localStorage:', error);
                hasLoadedFromStorage.current = true;
            }
        }
    }, [isAuthenticated, authLoading, bulkOrderItems.length]);
    
    // Note: Deduplication is now handled in setBulkOrderItemsDeduplicated wrapper
    // This useEffect is kept for safety but should rarely trigger
    useEffect(() => {
        if (bulkOrderItems.length === 0 || hasCheckedOut.current) {
            return;
        }
        
        // Quick check for duplicates
        const productIds = bulkOrderItems.map(i => String(i.productId || '').trim().toLowerCase());
        const uniqueIds = new Set(productIds);
        
        if (productIds.length !== uniqueIds.size) {
            console.warn('[BULK ORDER] ⚠️ Duplicates detected in useEffect, forcing deduplication');
            const deduplicated = deduplicateItems(bulkOrderItems);
            if (deduplicated.length !== bulkOrderItems.length) {
                setBulkOrderItemsDeduplicated(deduplicated);
            }
        }
    }, [bulkOrderItems.length]); // Only check length to avoid infinite loops
    
    // Save bulk order items to localStorage whenever they change
    useEffect(() => {
        // Don't save if we've checked out (to prevent saving after clearing)
        if (hasCheckedOut.current) {
            return;
        }
        
        // Only save if we've already loaded from storage (to prevent clearing on initial mount)
        if (!hasLoadedFromStorage.current) {
            return;
        }
        
        if (isAuthenticated && bulkOrderItems.length > 0) {
            try {
                localStorage.setItem('bulkOrderItems', JSON.stringify(bulkOrderItems));
            } catch (error) {
                console.error('Error saving bulk order to localStorage:', error);
            }
        } else if (bulkOrderItems.length === 0 && hasLoadedFromStorage.current) {
            // Only clear localStorage if we've loaded and user explicitly cleared items
            // Don't clear on initial mount
            const savedItems = localStorage.getItem('bulkOrderItems');
            if (savedItems) {
                // Only remove if there was something saved (user cleared it)
                localStorage.removeItem('bulkOrderItems');
            }
        }
    }, [bulkOrderItems, isAuthenticated]);
    
    // Save pickupDateTime to localStorage whenever it changes
    useEffect(() => {
        // Don't save if we've checked out (to prevent saving after clearing)
        if (hasCheckedOut.current) {
            return;
        }
        
        // Only save if we've already loaded from storage
        if (!hasLoadedFromStorage.current) {
            return;
        }
        
        if (isAuthenticated && pickupDateTime) {
            try {
                localStorage.setItem('bulkOrderPickupDateTime', pickupDateTime);
            } catch (error) {
                console.error('Error saving pickup date to localStorage:', error);
            }
        } else if (!pickupDateTime && hasLoadedFromStorage.current) {
            // Only remove if we've loaded and user cleared it
            const savedPickupDateTime = localStorage.getItem('bulkOrderPickupDateTime');
            if (savedPickupDateTime) {
                localStorage.removeItem('bulkOrderPickupDateTime');
            }
        }
    }, [pickupDateTime, isAuthenticated]);
    
    // Product search and browse state
    const [showProductBrowser, setShowProductBrowser] = useState(false);
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [navigatingProductId, setNavigatingProductId] = useState(null);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [productAvailableStock, setProductAvailableStock] = useState({}); // Store available stock for each product

    // Load product from navigation state - use ref to prevent duplicate additions
    const hasProcessedState = useRef(false);
    const hasLoadedFromStorage = useRef(false);
    const hasCheckedOut = useRef(false);
    const lastDeduplicatedItems = useRef(null);
    
    // Helper function to deduplicate items by productId
    const deduplicateItems = (items) => {
        if (!items || items.length === 0) return [];
        
        const itemMap = new Map();
        for (const item of items) {
            const productIdStr = String(item.productId || '').trim().toLowerCase();
            if (!productIdStr || productIdStr === 'undefined' || productIdStr === 'null' || productIdStr === '') {
                continue;
            }
            
            if (itemMap.has(productIdStr)) {
                // Merge duplicate - sum quantities
                const existing = itemMap.get(productIdStr);
                const existingQty = parseInt(existing.quantity) || 0;
                const newQty = parseInt(item.quantity) || 0;
                existing.quantity = existingQty + newQty;
                // Preserve other properties from the first occurrence
                Object.assign(existing, item, { quantity: existingQty + newQty });
            } else {
                itemMap.set(productIdStr, { ...item });
            }
        }
        
        return Array.from(itemMap.values());
    };
    
    // Wrapper for setBulkOrderItems that always deduplicates
    // IMPORTANT: This function calls setBulkOrderItems directly (not recursively) to avoid infinite loops
    const setBulkOrderItemsDeduplicated = useCallback((newItems) => {
        if (typeof newItems === 'function') {
            // Handle functional updates
            setBulkOrderItems(prev => {
                const updated = newItems(prev);
                const deduplicated = deduplicateItems(updated);
                if (deduplicated.length !== updated.length) {
                    console.warn('[BULK ORDER] ⚠️ Deduplicated items in setState:', {
                        before: updated.length,
                        after: deduplicated.length,
                        items: updated.map(i => ({ productId: i.productId, quantity: i.quantity, name: i.name }))
                    });
                }
                return deduplicated;
            });
        } else {
            // Handle direct value updates - call setBulkOrderItems directly, not the wrapper
            const deduplicated = deduplicateItems(newItems);
            if (deduplicated.length !== newItems.length) {
                console.warn('[BULK ORDER] ⚠️ Deduplicated items in setState:', {
                    before: newItems.length,
                    after: deduplicated.length,
                    items: newItems.map(i => ({ productId: i.productId, quantity: i.quantity, name: i.name }))
                });
            }
            // Call setBulkOrderItems directly to avoid infinite recursion
            setBulkOrderItems(deduplicated);
        }
    }, []);
    
    // Check authentication and redirect if not logged in
    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            navigate('/login', { 
                state: { from: '/bulk-order', message: 'Please log in to create bulk orders' }
            });
        }
    }, [authLoading, isAuthenticated, navigate]);

    // Clear bulk order items if returning from cancelled checkout or successful payment
    useEffect(() => {
        const urlParams = new URLSearchParams(location.search);
        
        // Clear items if checkout was cancelled
        if (urlParams.get('cancelled') === 'true') {
            setBulkOrderItemsDeduplicated([]);
            setPickupDateTime('');
            localStorage.removeItem('bulkOrderItems');
            localStorage.removeItem('bulkOrderPickupDateTime');
            hasCheckedOut.current = false; // Reset flag so items can be loaded again
            // Remove the cancelled parameter from URL
            navigate('/bulk-order', { replace: true });
            return;
        }
    }, [location.search, navigate]);

    // Aggressively clear items if localStorage is empty but state has items
    useEffect(() => {
        const savedItems = localStorage.getItem('bulkOrderItems');
        // If localStorage is empty but state has items, clear state immediately
        if (!savedItems && bulkOrderItems.length > 0 && hasLoadedFromStorage.current) {
            console.log('[BULK ORDER] Clearing items - localStorage empty but state has items');
            setBulkOrderItemsDeduplicated([]);
            setPickupDateTime('');
            hasCheckedOut.current = true; // Prevent reloading
        }
    }, [bulkOrderItems.length]);
    
    // Load products and categories when product browser is opened
    useEffect(() => {
        if (showProductBrowser) {
            loadProductsAndCategories();
        }
    }, [showProductBrowser]);
    
    // Fetch available stock for all filtered products
    useEffect(() => {
        if (filteredProducts.length > 0) {
            const fetchAllAvailableStock = async () => {
                const stockMap = {};
                for (const product of filteredProducts) {
                    const productId = product.productId || product.id || product.ProductID;
                    if (productId) {
                        try {
                            const availableStock = await fetchAvailableStock(productId);
                            if (availableStock !== null) {
                                stockMap[productId] = availableStock;
                            }
                        } catch (error) {
                            console.error(`Error fetching stock for product ${productId}:`, error);
                        }
                    }
                }
                setProductAvailableStock(stockMap);
            };
            fetchAllAvailableStock();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredProducts]);
    
    // Auto-show product browser if no items in bulk order
    useEffect(() => {
        if (bulkOrderItems.length === 0 && !showProductBrowser && !authLoading && isAuthenticated) {
            // Small delay to ensure page is loaded
            const timer = setTimeout(() => {
                setShowProductBrowser(true);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [bulkOrderItems.length, showProductBrowser, authLoading, isAuthenticated]);
    
    const loadProductsAndCategories = async () => {
        setLoadingProducts(true);
        try {
            const [productsData, categoriesData] = await Promise.all([
                getAllProducts(),
                getCategories()
            ]);
            const loadedProducts = productsData.products || [];
            setProducts(loadedProducts);
            setCategories(categoriesData.categories || []);
            // Initial filter
            filterProducts(loadedProducts);
        } catch (error) {
            console.error('Error loading products:', error);
        } finally {
            setLoadingProducts(false);
        }
    };
    
    const filterProducts = (productsList = products) => {
        let filtered = [...productsList];
        
        // Filter by search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(product =>
                product.name?.toLowerCase().includes(query) ||
                product.description?.toLowerCase().includes(query) ||
                product.sku?.toLowerCase().includes(query) ||
                product.categoryName?.toLowerCase().includes(query)
            );
        }
        
        // Filter by category
        if (selectedCategory) {
            filtered = filtered.filter(product =>
                product.categoryName === selectedCategory ||
                product.categoryId?.toString() === selectedCategory
            );
        }
        
        // Only show active products with available stock >= 10 (minimum stock requirement for bulk orders)
        // Note: We'll filter by available stock after fetching it, but for initial filter use raw stock
        filtered = filtered.filter(product => {
            const stock = product.stockQuantity || product.stock || product.StockQuantity || 0;
            return product.isActive !== false && stock >= 10;
        });
        
        setFilteredProducts(filtered);
    };
    
    // Filter products when search or category changes
    useEffect(() => {
        if (showProductBrowser && products.length > 0) {
            filterProducts();
        }
    }, [searchQuery, selectedCategory]);
    
        useEffect(() => {
        if (location.state?.product && !hasProcessedState.current) {
            hasProcessedState.current = true;
            const { product, quantity = 10 } = location.state;
            // Normalize product ID
            const productId = String(product.productId || product.id || product.ProductID);
            if (!productId || productId === 'undefined') {
                console.error('Product missing ID:', product);
                hasProcessedState.current = false;
                return;
            }
            
            // Fetch available stock (accounting for pending orders)
            fetchAvailableStock(productId).then(availableStock => {
                const stock = product.stockQuantity || product.StockQuantity || 0;
                const stockToUse = availableStock !== null ? availableStock : stock;
                const minQuantity = 10;
                
                // Validate stock availability
                if (stockToUse < minQuantity) {
                    setQuantityModalMessage(`This product has insufficient available stock. Minimum ${minQuantity} items required for bulk orders. Available: ${stockToUse}`);
                    setShowQuantityModal(true);
                    hasProcessedState.current = false;
                    return;
                }
                
                // Maximum is 16 or available stock, whichever is lower
                const maxAllowed = 16;
                const maxQuantity = Math.min(maxAllowed, stockToUse);
                
                // Ensure quantity is at least minimum and doesn't exceed maximum
                const initialQuantity = Math.max(minQuantity, Math.min(quantity, maxQuantity));
                
                setBulkOrderItemsDeduplicated(prev => {
                    // Normalize productId for comparison (handle UUID and numeric)
                    const normalizedProductId = String(productId).trim().toLowerCase();
                    const existingIndex = prev.findIndex(item => {
                        const itemProductId = String(item.productId || '').trim().toLowerCase();
                        return itemProductId === normalizedProductId;
                    });
                    
                    if (existingIndex >= 0) {
                        // Update existing item - ensure it doesn't exceed available stock
                        const existingItem = prev[existingIndex];
                // Maximum is 16 or available stock, whichever is lower
                const maxAllowed = 16;
                const maxQuantity = Math.min(maxAllowed, stockToUse);
                const newQuantity = Math.min(existingItem.quantity + quantity, maxQuantity);
                if (newQuantity < minQuantity) {
                    setQuantityModalMessage(`Minimum quantity is ${minQuantity} items. Current quantity: ${existingItem.quantity}`);
                    setShowQuantityModal(true);
                    return prev; // Return unchanged list
                }
                        console.log(`[BULK ORDER] Updating existing product ${productId} from location.state: ${existingItem.quantity} + ${quantity} = ${newQuantity}`);
                        return prev.map((item, idx) =>
                            idx === existingIndex
                                ? { ...item, quantity: newQuantity, stockQuantity: stockToUse }
                                : item
                        );
                    } else {
                        // Add new item with unique key
                        console.log(`[BULK ORDER] Adding new product ${productId} from location.state with quantity ${initialQuantity}`);
                        return [...prev, {
                            id: `${productId}-${Date.now()}-${Math.random()}`, // Unique ID for React key
                            productId: productId,
                            name: product.name || product.Name,
                            price: product.price || product.Price || 0,
                            quantity: initialQuantity,
                            sku: product.sku || product.SKU || `SKU-${productId}`,
                            stockQuantity: stockToUse,
                            image: product.imageUrl || product.thumbnail1 || product.images?.[0]
                        }];
                    }
                });
            }).catch(err => {
                console.error('Error fetching available stock:', err);
                hasProcessedState.current = false;
            });
            
            // Clear location state to prevent re-adding
            window.history.replaceState({}, document.title);
        }
        
        // Reset flag when location.state changes (new navigation)
        return () => {
            if (!location.state?.product) {
                hasProcessedState.current = false;
            }
        };
    }, [location.state]);

    const addProductToBulkOrder = async (product, quantity = 10) => {
        // Normalize product ID - handle both productId and id
        const productId = String(product.productId || product.id || product.ProductID);
        
        if (!productId || productId === 'undefined') {
            console.error('Product missing ID:', product);
            alert('Error: Product is missing an ID. Please try again.');
            return;
        }
        
        // Fetch available stock (accounting for pending orders)
        const availableStock = await fetchAvailableStock(productId);
        const stock = product.stockQuantity || product.StockQuantity || 0;
        const stockToUse = availableStock !== null ? availableStock : stock;
        const minQuantity = 10;
        
                // Validate stock availability
                if (stockToUse < minQuantity) {
                    setQuantityModalMessage(`This product has insufficient available stock. Minimum ${minQuantity} items required for bulk orders. Available: ${stockToUse}`);
                    setShowQuantityModal(true);
                    return;
                }
                
                // Maximum is 16 or available stock, whichever is lower
                const maxAllowed = 16;
                const maxQuantity = Math.min(maxAllowed, stockToUse);
                
                // Ensure quantity is at least minimum and doesn't exceed maximum
                const initialQuantity = Math.max(minQuantity, Math.min(quantity, maxQuantity));
        
        setBulkOrderItemsDeduplicated(prev => {
            // Normalize productId for comparison (handle UUID and numeric)
            const normalizedProductId = String(productId).trim().toLowerCase();
            const existingIndex = prev.findIndex(item => {
                const itemProductId = String(item.productId || '').trim().toLowerCase();
                return itemProductId === normalizedProductId;
            });
            
            if (existingIndex >= 0) {
                // Update existing item - ensure it doesn't exceed available stock
                const existingItem = prev[existingIndex];
                // Maximum is 16 or available stock, whichever is lower
                const maxAllowed = 16;
                const maxQuantity = Math.min(maxAllowed, stockToUse);
                const newQuantity = Math.min(existingItem.quantity + quantity, maxQuantity);
                if (newQuantity < minQuantity) {
                    setQuantityModalMessage(`Minimum quantity is ${minQuantity} items. Current quantity: ${existingItem.quantity}`);
                    setShowQuantityModal(true);
                    return prev; // Return unchanged list
                }
                console.log(`[BULK ORDER] Updating existing product ${productId}: ${existingItem.quantity} + ${quantity} = ${newQuantity}`);
                return prev.map((item, idx) =>
                    idx === existingIndex
                        ? { ...item, quantity: newQuantity, stockQuantity: stockToUse }
                        : item
                );
            } else {
                // Add new item with unique ID
                console.log(`[BULK ORDER] Adding new product ${productId} with quantity ${initialQuantity}`);
                return [...prev, {
                    id: `${productId}-${Date.now()}-${Math.random()}`, // Unique ID for React key
                    productId: productId,
                    name: product.name || product.Name,
                    price: product.price || product.Price || 0,
                    quantity: initialQuantity,
                    sku: product.sku || product.SKU || `SKU-${productId}`,
                    stockQuantity: stockToUse,
                    image: product.imageUrl || product.thumbnail1 || product.images?.[0]
                }];
            }
        });
    };

    const updateQuantity = (productId, quantity) => {
        const item = bulkOrderItems.find(item => String(item.productId) === String(productId));
        if (!item) return;
        
        const minQuantity = 10;
        const maxAllowed = 16; // Maximum allowed quantity
        const availableStock = item.stockQuantity || 0;
        // Maximum is the minimum of 16 or available stock
        const maxQuantity = Math.min(maxAllowed, availableStock);
        const parsedQuantity = parseInt(quantity) || minQuantity;
        
        // Enforce minimum of 10
        if (parsedQuantity < minQuantity) {
            setQuantityModalMessage(`Minimum quantity for bulk orders is ${minQuantity} items.`);
            setShowQuantityModal(true);
            // Set to minimum if below
            setBulkOrderItemsDeduplicated(items =>
                items.map(item =>
                    String(item.productId) === String(productId)
                        ? { ...item, quantity: minQuantity }
                        : item
                )
            );
            return;
        }
        
        // Enforce maximum (16 or available stock, whichever is lower)
        if (parsedQuantity > maxQuantity) {
            if (availableStock < maxAllowed) {
                setQuantityModalMessage(`Maximum quantity is ${maxQuantity} (available stock).`);
            } else {
                setQuantityModalMessage(`Maximum quantity for bulk orders is ${maxAllowed} items.`);
            }
            setShowQuantityModal(true);
            // Set to maximum if above
            setBulkOrderItemsDeduplicated(items =>
                items.map(item =>
                    String(item.productId) === String(productId)
                        ? { ...item, quantity: maxQuantity }
                        : item
                )
            );
            return;
        }
        
        if (parsedQuantity <= 0) {
            removeItem(productId);
        } else {
            setBulkOrderItemsDeduplicated(items =>
                items.map(item =>
                    String(item.productId) === String(productId)
                        ? { ...item, quantity: parsedQuantity }
                        : item
                )
            );
        }
    };

    const removeItem = (productId) => {
        setBulkOrderItemsDeduplicated(items => items.filter(item => String(item.productId) !== String(productId)));
    };

    const clearBulkOrder = () => {
        setShowClearModal(true);
    };

    const handleConfirmClear = () => {
        setShowClearModal(false);
        setBulkOrderItemsDeduplicated([]);
        setPickupDateTime('');
        // Clear localStorage
        localStorage.removeItem('bulkOrderItems');
        localStorage.removeItem('bulkOrderPickupDateTime');
    };

    const calculateItemTotal = (item) => {
        return {
            unitPrice: item.price,
            total: item.price * item.quantity
        };
    };

    const calculateSubtotal = () => {
        const items = hasCheckedOut.current ? [] : bulkOrderItems;
        return items.reduce((total, item) => {
            const itemTotal = calculateItemTotal(item);
            return total + itemTotal.total;
        }, 0);
    };

    const calculateGrandTotal = () => {
        const subtotal = calculateSubtotal();
        return subtotal;
    };

    const calculateTotalQuantity = () => {
        const items = hasCheckedOut.current ? [] : bulkOrderItems;
        return items.reduce((total, item) => total + item.quantity, 0);
    };

    const handleSubmitOrder = async () => {
        if (bulkOrderItems.length === 0) {
            alert('Please add items to your bulk order');
            return;
        }

        // Validate minimum quantity for all items
        const minQuantity = 10;
        const itemsBelowMinimum = bulkOrderItems.filter(item => item.quantity < minQuantity);
        if (itemsBelowMinimum.length > 0) {
            setQuantityModalMessage(`All items must have a minimum quantity of ${minQuantity} items. Please update the quantities.`);
            setShowQuantityModal(true);
            return;
        }

        // Validate maximum quantity (16 or available stock, whichever is lower)
        const maxAllowed = 16;
        const itemsExceedingLimit = bulkOrderItems.filter(item => {
            const maxQuantity = Math.min(maxAllowed, item.stockQuantity || 0);
            return item.quantity > maxQuantity;
        });
        if (itemsExceedingLimit.length > 0) {
            const itemNames = itemsExceedingLimit.map(item => item.name).join(', ');
            setQuantityModalMessage(`The following items exceed the maximum quantity limit (16 items or available stock): ${itemNames}. Please adjust quantities.`);
            setShowQuantityModal(true);
            return;
        }

        // Validate pickup date if provided
        if (!pickupDateTime) {
            alert('Please select a pickup date and time');
            return;
        }

        // Show confirmation modal
        setShowConfirmationModal(true);
    };

    const handleConfirmOrder = async () => {
        setShowConfirmationModal(false);
        setSubmitting(true);
        try {
            // Validate all items have productId
            const invalidItems = bulkOrderItems.filter(item => !item.productId);
            if (invalidItems.length > 0) {
                alert('Some items are missing product IDs. Please refresh and try again.');
                setSubmitting(false);
                return;
            }
            
            // Validate pickup date if provided
            if (!pickupDateTime) {
                alert('Please select a pickup date and time');
                setSubmitting(false);
                return;
            }

            // Check if Stripe is available
            const isStripeAvailable = await stripeService.isStripeAvailable();
            if (!isStripeAvailable) {
                alert('Payment system is not available. Please contact support.');
                setSubmitting(false);
                return;
            }

            // Store items in a ref before clearing (needed for checkout)
            const itemsSnapshot = [...bulkOrderItems];
            const pickupDateTimeSnapshot = pickupDateTime;

            // Deduplicate items by productId before sending to Stripe
            // Normalize productId for consistent comparison (handle UUID and numeric)
            const itemMap = new Map();
            for (const item of itemsSnapshot) {
                const productIdStr = String(item.productId || '').trim();
                if (!productIdStr || productIdStr === 'undefined' || productIdStr === 'null' || productIdStr === '') {
                    console.warn('[BULK ORDER] Skipping item with invalid productId:', item);
                    continue;
                }
                
                // Normalize to lowercase for consistent comparison
                const key = productIdStr.toLowerCase();
                
                if (itemMap.has(key)) {
                    // Sum quantities for duplicate products
                    const existing = itemMap.get(key);
                    const existingQty = parseInt(existing.quantity) || 0;
                    const newQty = parseInt(item.quantity) || 0;
                    existing.quantity = existingQty + newQty;
                    console.log(`[BULK ORDER] Merged duplicate product ${key}: ${existingQty} + ${newQty} = ${existing.quantity}`);
                } else {
                    itemMap.set(key, { ...item });
                }
            }
            
            const deduplicatedItems = Array.from(itemMap.values());
            console.log('[BULK ORDER] Items before deduplication:', itemsSnapshot.length, 'after:', deduplicatedItems.length);
            
            if (deduplicatedItems.length !== itemsSnapshot.length) {
                console.warn('[BULK ORDER] ⚠️ Duplicate items detected and merged!', {
                    before: itemsSnapshot.length,
                    after: deduplicatedItems.length,
                    originalItems: itemsSnapshot.map(i => ({ productId: i.productId, quantity: i.quantity, name: i.name }))
                });
            }

            // Prepare items for Stripe checkout from deduplicated items
            const itemsForStripe = deduplicatedItems.map(item => ({
                productId: item.productId,
                name: item.name || 'Unknown Product',
                quantity: parseInt(item.quantity) || 1,
                unitPrice: parseFloat(item.price) || 0,
                price: parseFloat(item.price) || 0,
                sku: item.sku || `SKU-${item.productId}`
            }));

            // Validate stock availability before checkout (use deduplicated items)
            try {
                const stockCheckResponse = await apiClient.post('/api/check-bulk-order-stock', {
                    items: deduplicatedItems.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity
                    }))
                });

                // apiClient.post() returns response.data directly, not a response object
                if (!stockCheckResponse || !stockCheckResponse.success) {
                    alert(stockCheckResponse?.message || 'Some items are out of stock. Please adjust your order.');
                    setSubmitting(false);
                    return;
                }
            } catch (error) {
                console.error('Error checking stock:', error);
                // Check if error has a response with message
                const errorMessage = error.response?.data?.message || error.message || 'Error checking stock availability. Please try again.';
                alert(errorMessage);
                setSubmitting(false);
                return;
            }

            // Calculate totals from deduplicated items
            const subtotal = deduplicatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const total = subtotal;

            // Get customer email
            const customerEmail = user?.email || '';
            if (!customerEmail) {
                alert('Please log in to complete your bulk order');
                setSubmitting(false);
                return;
            }

            // Clear state and localStorage IMMEDIATELY before checkout to update UI
            setBulkOrderItemsDeduplicated([]);
            setPickupDateTime('');
            localStorage.removeItem('bulkOrderItems');
            localStorage.removeItem('bulkOrderPickupDateTime');
            hasCheckedOut.current = true; // Prevent reloading

            // Create Stripe checkout session for bulk order using snapshot data
            await stripeService.createCheckoutSession(
                itemsForStripe,
                customerEmail,
                'E-Wallet',
                {
                    orderType: 'bulk',
                    isBulkOrder: true,
                    deliveryType: 'pickup',
                    pickupDate: pickupDateTimeSnapshot,
                    subtotal: subtotal,
                    discount: 0,
                    total: total
                }
            );

            // Note: We don't set submitting to false here because the page will redirect to Stripe
            // If there's an error, it will be caught below
        } catch (error) {
            console.error('Error processing bulk order payment:', error);
            // Reset checkout flag on error so user can try again
            hasCheckedOut.current = false;
            alert(error.message || 'Failed to process payment. Please try again.');
            setSubmitting(false);
        }
    };


    const exportToCSV = () => {
        if (bulkOrderItems.length === 0) {
            alert('No items to export');
            return;
        }

        const csvContent = [
            ['Product Name', 'SKU', 'Quantity', 'Unit Price', 'Total Price'],
            ...bulkOrderItems.map(item => {
                const itemTotal = calculateItemTotal(item);
                return [
                    item.name,
                    item.sku,
                    item.quantity,
                    formatPrice(item.price),
                    formatPrice(itemTotal.total)
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

    // Show loading or nothing while checking authentication
    if (authLoading) {
        return <div>Loading...</div>;
    }

    if (!isAuthenticated) {
        return null; // Will redirect via useEffect
    }

    // Compute display items - if checkout flag is set, show empty even if state has items
    const displayItems = hasCheckedOut.current ? [] : bulkOrderItems;
    const hasItems = displayItems.length > 0;

    return (
        <div className="bulk-order-page">
            <PageHeader 
                title="Bulk Order" 
                subtitle="Order multiple items (minimum 10 items per product)"
            />

            <div className="bulk-order-container">
                <div className="bulk-order-form-wrapper">
                    {/* Bulk Order Summary */}
                    <div className="bulk-order-summary">
                        <div className="bulk-order-header">
                            <h3>Bulk Order Summary</h3>
                            {hasItems && (
                                <div className="bulk-order-header-actions">
                                    <button onClick={exportToCSV} className="export-btn">
                                        Export to CSV
                                    </button>
                                    <button onClick={clearBulkOrder} className="clear-btn">
                                        Clear All
                                    </button>
                                </div>
                            )}
                        </div>

                        {!hasItems ? (
                            <div className="empty-bulk-order">
                                <p>No items in bulk order</p>
                                <p className="hint">Add products to your bulk order using the product browser below</p>
                                <button 
                                    onClick={() => setShowProductBrowser(true)} 
                                    className="btn-primary"
                                >
                                    Browse Products
                                </button>
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
                                                <th>Total</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayItems.map((item, index) => {
                                                const itemTotal = calculateItemTotal(item);
                                                return (
                                                    <tr key={item.id || `${item.productId}-${index}`}>
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
                                                                min="10"
                                                                max={Math.min(16, item.stockQuantity || 0)}
                                                                value={item.quantity}
                                                                onChange={(e) => {
                                                                    const value = e.target.value;
                                                                    if (value === '') {
                                                                        // Allow empty input temporarily
                                                                        return;
                                                                    }
                                                                    const numValue = parseInt(value);
                                                                    if (!isNaN(numValue)) {
                                                                        updateQuantity(String(item.productId), numValue);
                                                                    }
                                                                }}
                                                                onBlur={(e) => {
                                                                    const value = parseInt(e.target.value);
                                                                    const maxAllowed = Math.min(16, item.stockQuantity || 0);
                                                                    if (isNaN(value) || value < 10) {
                                                                        updateQuantity(String(item.productId), 10);
                                                                    } else if (value > maxAllowed) {
                                                                        updateQuantity(String(item.productId), maxAllowed);
                                                                    }
                                                                }}
                                                                className="quantity-input"
                                                                title={`Minimum: 10, Maximum: ${Math.min(16, item.stockQuantity || 0)} (16 items or available stock, whichever is lower)`}
                                                            />
                                                            <div className="quantity-hint">
                                                                Min: 10 | Max: {Math.min(16, item.stockQuantity || 0)}
                                                            </div>
                                                        </td>
                                                        <td>{formatPrice(item.price)}</td>
                                                        <td className="total-cell">
                                                            {formatPrice(itemTotal.total)}
                                                        </td>
                                                        <td>
                                                            <button
                                                                onClick={() => removeItem(String(item.productId))}
                                                                className="remove-item-btn"
                                                                title="Remove item from bulk order"
                                                            >
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M3 6h18"></path>
                                                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                                                </svg>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pickup Date/Time Picker */}
                                <div className="pickup-datetime-card">
                                    <div className="pickup-datetime-header">
                                        <h4>Pickup Date & Time</h4>
                                        <span className="pickup-required-badge">Required</span>
                                    </div>
                                    <div className="pickup-datetime-content">
                                        <label className="pickup-label">
                                            Select your preferred pickup date and time
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={pickupDateTime}
                                            onChange={(e) => setPickupDateTime(e.target.value)}
                                        min={(() => {
                                            const minDate = new Date();
                                            minDate.setDate(minDate.getDate() + 3);
                                            return minDate.toISOString().slice(0, 16);
                                        })()}
                                        max={(() => {
                                            const maxDate = new Date();
                                            maxDate.setDate(maxDate.getDate() + 14);
                                            return maxDate.toISOString().slice(0, 16);
                                        })()}
                                        required
                                            className="pickup-input"
                                        />
                                        {!pickupDateTime ? (
                                            <p className="pickup-hint">
                                            Please select a pickup date and time (3-14 days from now)
                                        </p>
                                        ) : (
                                            <p className="pickup-confirmed">
                                                ✓ Pickup scheduled for {new Date(pickupDateTime).toLocaleString('en-US', {
                                                    weekday: 'long',
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Order Summary Card */}
                                <div className="order-summary-card">
                                    <div className="order-summary-header">
                                        <h4>Order Summary</h4>
                                    </div>
                                    <div className="order-summary-content">
                                        <div className="summary-row">
                                            <span className="summary-label">Total Products:</span>
                                            <span className="summary-value">{displayItems.length}</span>
                                        </div>
                                        <div className="summary-row">
                                            <span className="summary-label">Total Quantity:</span>
                                            <span className="summary-value">{calculateTotalQuantity()} items</span>
                                        </div>
                                        <div className="summary-row">
                                            <span className="summary-label">Subtotal:</span>
                                            <span className="summary-value">{formatPrice(calculateSubtotal())}</span>
                                        </div>
                                        <div className="summary-divider"></div>
                                        <div className="summary-row summary-grand-total">
                                            <span className="summary-label">Grand Total:</span>
                                            <span className="summary-value">{formatPrice(calculateGrandTotal())}</span>
                                        </div>
                                        {pickupDateTime && (
                                            <div className="summary-row pickup-info">
                                                <span className="summary-label">Pickup Date & Time:</span>
                                                <span className="summary-value">
                                                    {new Date(pickupDateTime).toLocaleString('en-US', {
                                                        weekday: 'long',
                                                        year: 'numeric',
                                                        month: 'long',
                                                        day: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bulk-order-actions">
                                    <button 
                                        onClick={handleSubmitOrder} 
                                        className="submit-btn"
                                        disabled={submitting || !pickupDateTime || !hasItems}
                                    >
                                        {submitting ? 'Processing...' : 'Review & Submit Order'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    
                    {/* Product Browser Section */}
                    <div className="product-browser-section">
                        <div className="product-browser-header">
                            <div>
                                <h3>Browse Products</h3>
                                <p className="volume-discount-info">
                                    Minimum order: 10 items per product | Maximum: 16 items (or available stock, whichever is lower)
                                </p>
                            </div>
                            <button 
                                onClick={() => setShowProductBrowser(!showProductBrowser)}
                                className="toggle-browser-btn"
                            >
                                {showProductBrowser ? 'Hide Products' : 'Show Products'}
                            </button>
                        </div>
                        
                        {showProductBrowser && (
                            <div className="product-browser-content">
                                {/* Search and Filter */}
                                <div className="product-search-filters">
                                    <div className="search-box">
                                        <input
                                            type="text"
                                            placeholder="Search products by name, SKU, or description..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="search-input"
                                        />
                                    </div>
                                    <div className="category-filter">
                                        <select
                                            value={selectedCategory}
                                            onChange={(e) => setSelectedCategory(e.target.value)}
                                            className="category-select"
                                        >
                                            <option value="">All Categories</option>
                                            {categories.map((cat, idx) => (
                                                <option key={idx} value={cat.name || cat}>
                                                    {cat.name || cat}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                
                                {/* Products Grid */}
                                {loadingProducts ? (
                                    <div className="loading-products">Loading products...</div>
                                ) : filteredProducts.length > 0 ? (
                                    <div className="products-grid">
                                        {filteredProducts.map((product) => {
                                            const productId = product.productId || product.id || product.ProductID;
                                            const productName = product.name || product.Name;
                                            const productPrice = product.price || product.Price || 0;
                                            const productSku = product.sku || product.SKU || `SKU-${productId}`;
                                            const productSlug = product.slug || product.Slug || productSku || productId;
                                            const rawStock = product.stockQuantity || product.StockQuantity || product.stock || 0;
                                            // Use available stock if available, otherwise fallback to raw stock
                                            const productStock = productAvailableStock[productId] !== undefined 
                                                ? productAvailableStock[productId] 
                                                : rawStock;
                                            const productImage = getPrimaryImageUrl(product);
                                            
                                            const handleCardClick = () => {
                                                if (navigatingProductId === productId) return; // Prevent multiple clicks
                                                
                                                setNavigatingProductId(productId);
                                                
                                                // Small delay to show spinner before navigation
                                                setTimeout(() => {
                                                    navigate(`/product/${productSlug}`);
                                                }, 100);
                                            };
                                            
                                            const handleButtonClick = (e) => {
                                                e.stopPropagation(); // Prevent card click when button is clicked
                                                addProductToBulkOrder({
                                                    productId: productId,
                                                    id: productId,
                                                    ProductID: productId,
                                                    name: productName,
                                                    Name: productName,
                                                    price: productPrice,
                                                    Price: productPrice,
                                                    sku: productSku,
                                                    SKU: productSku,
                                                    stockQuantity: productStock,
                                                    StockQuantity: productStock,
                                                    imageUrl: productImage,
                                                    thumbnail1: productImage,
                                                    images: productImage ? [productImage] : []
                                                });
                                                // Scroll to top to show the added item
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                            };
                                            
                                            return (
                                                <div 
                                                    key={productId} 
                                                    className="product-browser-card"
                                                    onClick={handleCardClick}
                                                    style={{ cursor: 'pointer', position: 'relative' }}
                                                >
                                                    {navigatingProductId === productId && (
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
                                                    {productImage && (
                                                        <img 
                                                            src={productImage} 
                                                            alt={productName}
                                                            className="product-browser-image"
                                                        />
                                                    )}
                                                    <div className="product-browser-info">
                                                        <h4 className="product-browser-name">{productName}</h4>
                                                        <p className="product-browser-sku">SKU: {productSku}</p>
                                                        <p className="product-browser-price">{formatPrice(productPrice)}</p>
                                                        <p className="product-browser-stock">
                                                            Stock: {productStock} available
                                                            {productStock < 10 && productStock > 0 && (
                                                                <span className="low-stock-warning"> (Low Stock - Minimum 10 required)</span>
                                                            )}
                                                            {productAvailableStock[productId] !== undefined && productAvailableStock[productId] !== rawStock && (
                                                                <span className="available-stock-note" style={{ fontSize: '0.85rem', color: '#6b7280', display: 'block', marginTop: '4px' }}>
                                                                    (Available: {productStock}, Pending: {rawStock - productStock})
                                                                </span>
                                                            )}
                                                        </p>
                                                        <button
                                                            onClick={handleButtonClick}
                                                            className="add-to-bulk-btn"
                                                            disabled={productStock < 10}
                                                        >
                                                            {productStock >= 10 ? 'Add to Bulk Order' : productStock > 0 ? 'Minimum 10 Required' : 'Out of Stock'}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="no-products-found">
                                        <p>No products found. Try adjusting your search or filter.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
            <Modal
                isOpen={showConfirmationModal}
                onClose={() => setShowConfirmationModal(false)}
                title="Confirm Your Bulk Order"
            >
                <div className="confirmation-summary">
                    <div className="confirmation-header">
                        <p>Please review your order details before submitting:</p>
                    </div>
                    
                    <div className="confirmation-items">
                        <h5>Order Items</h5>
                        <div className="confirmation-items-list">
                            {displayItems.map((item, index) => {
                                const itemTotal = calculateItemTotal(item);
                                return (
                                    <div key={item.id || `${item.productId}-${index}`} className="confirmation-item">
                                        <div className="confirmation-item-image">
                                            {item.image && (
                                                <img src={item.image} alt={item.name} />
                                            )}
                                        </div>
                                        <div className="confirmation-item-details">
                                            <h6>{item.name}</h6>
                                            <p className="confirmation-item-sku">SKU: {item.sku}</p>
                                            <div className="confirmation-item-meta">
                                                <span>Qty: {item.quantity}</span>
                                                <span>× {formatPrice(item.price)}</span>
                                            </div>
                                        </div>
                                        <div className="confirmation-item-total">
                                            {formatPrice(itemTotal.total)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="confirmation-summary-totals">
                        <div className="confirmation-summary-row">
                            <span>Total Products:</span>
                            <span>{displayItems.length}</span>
                        </div>
                        <div className="confirmation-summary-row">
                            <span>Total Quantity:</span>
                            <span>{calculateTotalQuantity()} items</span>
                        </div>
                        <div className="confirmation-summary-row">
                            <span>Subtotal:</span>
                            <span>{formatPrice(calculateSubtotal())}</span>
                        </div>
                        <div className="confirmation-summary-divider"></div>
                        <div className="confirmation-summary-row confirmation-grand-total">
                            <span>Grand Total:</span>
                            <span>{formatPrice(calculateGrandTotal())}</span>
                        </div>
                    </div>

                    <div className="confirmation-pickup-details">
                        <h5>Pickup Details</h5>
                        <div className="confirmation-pickup-info">
                            <p>
                                <strong>Date & Time:</strong> {new Date(pickupDateTime).toLocaleString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </p>
                            <p>
                                <strong>Method:</strong> Pickup
                            </p>
                        </div>
                    </div>

                    <div className="confirmation-actions">
                        <button 
                            onClick={() => setShowConfirmationModal(false)}
                            className="confirmation-cancel-btn"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleConfirmOrder}
                            className="confirmation-submit-btn"
                            disabled={submitting}
                        >
                            {submitting ? 'Processing...' : 'Confirm & Proceed to Payment'}
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

            {/* Clear All Confirmation Modal */}
            <ConfirmationModal
                isOpen={showClearModal}
                onClose={() => setShowClearModal(false)}
                onConfirm={handleConfirmClear}
                title="Clear Bulk Order"
                message="Are you sure you want to clear all items from your bulk order? This action cannot be undone."
                confirmText="Clear All"
                cancelText="Cancel"
                type="warning"
            />

            {/* Quantity Validation Modal */}
            <ConfirmationModal
                isOpen={showQuantityModal}
                onClose={() => setShowQuantityModal(false)}
                onConfirm={() => setShowQuantityModal(false)}
                title="Quantity Limit"
                message={quantityModalMessage}
                confirmText="OK"
                cancelText=""
                type="warning"
            />
        </div>
    );
};

export default BulkOrderPage;
