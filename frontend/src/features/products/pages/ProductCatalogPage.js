import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import ProductFilter from '../components/ProductFilter';
import PageHeader from '../../../shared/components/layout/PageHeader';
import Modal from '../../../shared/components/ui/Modal';
import { getAllProducts, getCategories } from '../services/productService';
import AudioLoader from '../../../shared/components/ui/AudioLoader';
import '../../../app/pages.css';
import '../../../shared/components/ui/modal.css';
import apiClient from '../../../shared/services/api/apiClient';
import { getSellableStock } from '../../../shared/utils/productUtils';
import { usePrimeAvailableStockBatch } from '../../../shared/hooks/useAvailableStock';

const ProductCatalog = () => {
    const location = useLocation();
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        categories: [],
        priceRange: '',
        sortBy: 'name',
        featured: false,
        inStock: false,
        customizable: false,
        colors: [],
        materials: [],
        outOfStock: false,
        searchQuery: ''
    });
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [selectedCategoryName, setSelectedCategoryName] = useState('');
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

    const productIdsForStock = useMemo(
        () => products.map((p) => p.id).filter(Boolean),
        [products]
    );
    usePrimeAvailableStockBatch(productIdsForStock);

    // Parse URL parameters
    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const categoryParam = searchParams.get('category');
        const searchQuery = searchParams.get('search');

        setFilters(prev => ({
            ...prev,
            categories: categoryParam ? [categoryParam] : [],
            searchQuery: searchQuery || ''
        }));

        if (categoryParam) {
            setSelectedCategoryName(categoryParam);
        } else if (searchQuery) {
            // If there's a search query but no category, clear category selection
            setSelectedCategoryName('');
        }
    }, [location.search]);

    useEffect(() => {
        loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load
    }, []);

    useEffect(() => {
        applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filter when products/filters change
    }, [products, filters]);

    const loadData = async () => {
        try {
            const [productsResponse, categoriesResponse] = await Promise.all([
                getAllProducts(),
                getCategories()
            ]);
            const productsData = productsResponse.products || [];
            const categoriesData = categoriesResponse.categories || [];
            
            // Hydrate materials per product so the "Material" filter actually matches real data.
            const hydrateMaterials = async (list) => {
                const uniqueIds = [...new Set(
                    (list || [])
                        .map((p) => String(p?.id || p?.ProductID || '').trim())
                        .filter((v) => v.length > 0)
                )];

                if (uniqueIds.length === 0) return list;

                const cacheKey = 'productMaterialsCache:v1';
                let cache = {};
                try {
                    cache = JSON.parse(sessionStorage.getItem(cacheKey) || '{}') || {};
                } catch {
                    cache = {};
                }

                const CONCURRENCY = 6;
                let idx = 0;
                const results = {};
                const workers = new Array(CONCURRENCY).fill(null).map(async () => {
                    while (idx < uniqueIds.length) {
                        const productId = uniqueIds[idx];
                        idx += 1;

                        if (cache[productId]) {
                            results[productId] = cache[productId];
                            continue;
                        }

                        try {
                            const response = await apiClient.get(`/api/products/${encodeURIComponent(productId)}/materials`);
                            const names = (response?.success && Array.isArray(response.materials))
                                ? response.materials
                                    .map((m) => String(m?.MaterialName || m?.name || m || '').trim())
                                    .filter(Boolean)
                                : [];
                            const text = names.join(', ');
                            results[productId] = text;
                            cache[productId] = text;
                        } catch {
                            results[productId] = '';
                            cache[productId] = '';
                        }
                    }
                });

                await Promise.all(workers);
                try {
                    sessionStorage.setItem(cacheKey, JSON.stringify(cache));
                } catch {}

                return (list || []).map((p) => {
                    const productId = String(p?.id || p?.ProductID || '').trim();
                    const hydrated = productId ? (results[productId] ?? cache[productId] ?? '') : '';
                    return { ...p, __materialsText: hydrated };
                });
            };

            setProducts(productsData);
            setCategories([
                { id: '', name: 'All Products', count: productsData.length },
                ...categoriesData.map(cat => ({
                    id: cat,
                    name: cat,
                    count: productsData.filter(p => p.categoryName === cat).length
                }))
            ]);
            hydrateMaterials(productsData)
                .then((hydrated) => setProducts(hydrated))
                .catch(() => {});
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };


    const applyFilters = () => {
        let filtered = [...products];

        // Search query filter - filter by product name or category name
        if (filters.searchQuery && filters.searchQuery.trim()) {
            const searchTerm = filters.searchQuery.trim().toLowerCase();
            filtered = filtered.filter(product => {
                const productName = (product.name || '').toLowerCase();
                const categoryName = (product.categoryName || '').toLowerCase();
                return productName.includes(searchTerm) || categoryName.includes(searchTerm);
            });
        }

        // Category filter
        if (filters.categories && filters.categories.length > 0) {
            filtered = filtered.filter(product =>
                filters.categories.some(category =>
                    product.categoryId?.toString() === category ||
                    product.categoryName === category ||
                    product.categoryName?.toLowerCase() === category
                )
            );
        }


        // Price range filter
        if (filters.priceRange) {
            const [min, max] = filters.priceRange.split('-').map(Number);
            filtered = filtered.filter(product => {
                const price = (product.hasDiscount && product.discountInfo) ? product.discountInfo.discountedPrice : product.price;
                if (max === 999999) {
                    // For "Over " option
                    return price >= min;
                }
                return price >= min && price <= max;
            });
        }

        // Quick filters
        if (filters.featured) {
            filtered = filtered.filter(product => product.featured);
        }

        if (filters.inStock) {
            filtered = filtered.filter(product => {
                const currentStock = getSellableStock(product);
                return currentStock > 0;
            });
        }

        if (filters.outOfStock) {
            filtered = filtered.filter(product => {
                const currentStock = getSellableStock(product);
                return currentStock === 0;
            });
        }

        if (filters.customizable) {
            filtered = filtered.filter(product => product.customizable);
        }


        // Material filter
        if (filters.materials && filters.materials.length > 0) {
            filtered = filtered.filter((product) => {
                const materialValue =
                    product?.__materialsText ??
                    product?.material ??
                    product?.Material ??
                    product?.materialName ??
                    product?.MaterialName ??
                    product?.Materials ??
                    product?.materials ??
                    '';

                const materialText = Array.isArray(materialValue)
                    ? materialValue
                        .map((m) => (m?.name ?? m?.MaterialName ?? m?.material ?? m ?? ''))
                        .join(', ')
                    : String(materialValue);

                const normalized = materialText.toLowerCase();
                return filters.materials.some((material) => normalized.includes(String(material).toLowerCase()));
            });
        }

        // Sort
        filtered.sort((a, b) => {
            const priceA = (a.hasDiscount && a.discountInfo) ? a.discountInfo.discountedPrice : a.price;
            const priceB = (b.hasDiscount && b.discountInfo) ? b.discountInfo.discountedPrice : b.price;

            switch (filters.sortBy) {
                case 'price-low':
                    return priceA - priceB;
                case 'price-high':
                    return priceB - priceA;
                case 'name':
                default:
                    return a.name.localeCompare(b.name);
            }
        });

        setFilteredProducts(filtered);
    };

    const handleFilterChange = (newFilters) => {
        setFilters({ ...filters, ...newFilters });
    };

    const clearAllFilters = () => {
        setFilters({
            categories: [],
            priceRange: '',
            sortBy: 'name',
            featured: false,
            inStock: false,
            customizable: false,
            colors: [],
            materials: [],
            outOfStock: false
        });
    };

    const handleApplyFilters = () => {
        setIsFilterModalOpen(false);
    };

    const removeFilter = (filterType, value = null) => {
        if (filterType === 'materials' && value) {
            setFilters(prev => ({
                ...prev,
                materials: prev.materials.filter(m => m !== value)
            }));
        } else {
            setFilters(prev => ({
                ...prev,
                [filterType]: filterType === 'sortBy' ? 'name' : (Array.isArray(prev[filterType]) ? [] : false)
            }));
        }
    };

    const getActiveFilters = () => {
        const activeFilters = [];
        
        if (filters.priceRange) {
            const [min, max] = filters.priceRange.split('-');
            activeFilters.push({
                type: 'priceRange',
                label: `Price: ₱${min}.00 - ₱${max}.00`,
                value: filters.priceRange
            });
        }
        
        
        if (filters.inStock) {
            activeFilters.push({
                type: 'inStock',
                label: 'In Stock',
                value: true
            });
        }
        
        return activeFilters;
    };

    if (loading) {
        return (
            <div className="catalog-page">
                <div className="container">
                    <div className="loading">
                        <AudioLoader size="large" color="#F0B21B" />
                        <p>Loading products...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="catalog-page">
            <div className="container">
                <PageHeader
                    breadcrumbs={[
                        { label: 'Home', href: '/' },
                        { label: 'Products', href: '/products' },
                        ...(selectedCategoryName ? [{ label: selectedCategoryName }] : []),
                        ...(filters.searchQuery ? [{ label: `Search: ${filters.searchQuery}` }] : [])
                    ]}
                    title={
                        filters.searchQuery 
                            ? `Search Results for "${filters.searchQuery}"` 
                            : selectedCategoryName 
                            ? `${selectedCategoryName} Collection` 
                            : 'Product Catalog'
                    }
                    subtitle={
                        filters.searchQuery
                            ? `Found ${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''} matching your search`
                            : selectedCategoryName
                            ? `Explore our premium ${selectedCategoryName} collection`
                            : 'Discover our complete collection of premium office furniture'
                    }
                />
                <div className="catalog-header">
                    {selectedCategoryName && (
                        <div className="category-actions">
                            <Link to="/products" className="clear-filter-btn">
                                View All Products
                            </Link>
                        </div>
                    )}
                </div>

                <div className="catalog-content">
                    <aside className="catalog-sidebar">
                        <ProductFilter 
                            categories={categories}
                            products={products}
                            filters={filters}
                            onFilterChange={handleFilterChange}
                            onClearFilters={clearAllFilters}
                        />
                    </aside>

                    <main className="catalog-main">
                        {/* Mobile Filter Toggle */}
                        <button 
                            className="mobile-filter-toggle"
                            onClick={() => setIsFilterModalOpen(true)}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path 
                                    d="M3 4H21M7 8H17M10 12H14" 
                                    stroke="currentColor" 
                                    strokeWidth="2" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round"
                                />
                            </svg>
                            Filter Products
                        </button>
                        <div className="catalog-controls">
                            <div className="results-info">
                                <span>Showing 1-12 of {filteredProducts.length} results</span>
                            </div>

                            <div className="catalog-actions">
                                <select
                                    value={filters.sortBy}
                                    onChange={(e) => handleFilterChange({ sortBy: e.target.value })}
                                    className="sort-select"
                                >
                                    <option value="name">Sort by: Default Sorting</option>
                                    <option value="price-low">Price: Low to High</option>
                                    <option value="price-high">Price: High to Low</option>
                                </select>
                            </div>
                        </div>

                        {/* Active Filters */}
                        {getActiveFilters().length > 0 && (
                            <div className="active-filters">
                                {getActiveFilters().map((filter, index) => (
                                    <div key={index} className="filter-tag">
                                        <span>{filter.label}</span>
                                        <button 
                                            onClick={() => removeFilter(filter.type, filter.value)}
                                            className="remove-filter"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                                <button 
                                    onClick={clearAllFilters}
                                    className="clear-all-filters"
                                >
                                    Clear All
                                </button>
                            </div>
                        )}

                        <div className="products-grid">
                            {filteredProducts.map(product => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </div>

                        {filteredProducts.length === 0 && (
                            <div className="no-products">
                                <h3>No products found</h3>
                                <p>Try adjusting your filters or search terms</p>
                            </div>
                        )}
                    </main>
                </div>

                {/* Mobile Filter Modal */}
                <Modal
                    isOpen={isFilterModalOpen}
                    onClose={() => setIsFilterModalOpen(false)}
                    title="Filter Products"
                    size="fullscreen"
                    className="filter-modal"
                >
                    <div className="filter-modal-content">
                        <div className="filter-modal-body">
                            <ProductFilter 
                                categories={categories}
                                products={products}
                                filters={filters}
                                onFilterChange={handleFilterChange}
                                onClearFilters={clearAllFilters}
                            />
                        </div>
                        <div className="filter-modal-footer">
                            <button 
                                className="btn btn-secondary"
                                onClick={() => setIsFilterModalOpen(false)}
                            >
                                Cancel
                            </button>
                            <button 
                                className="btn btn-primary"
                                onClick={handleApplyFilters}
                            >
                                Apply Filters
                            </button>
                        </div>
                    </div>
                </Modal>
            </div>
        </div>
    );
};

export default ProductCatalog;
