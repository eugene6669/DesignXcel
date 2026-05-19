import React, { useState, useEffect } from "react";
import apiClient from "../../../shared/services/api/apiClient";
import { getSellableStock } from "../../../shared/utils/productUtils";

const ProductFilter = ({ categories, products, filters, onFilterChange, onClearFilters }) => {
  const [priceRange, setPriceRange] = useState([25, 125]);
  const [realCategories, setRealCategories] = useState([]);
  const [realMaterials, setRealMaterials] = useState([]);
  const [priceRangeData, setPriceRangeData] = useState({ min: 25, max: 500 });
  const [stockStatus, setStockStatus] = useState({ inStock: 0, outOfStock: 0 });
  const [loading, setLoading] = useState(true);
  
  const handleCheckboxChange = (filterType, checked) => {
    onFilterChange({ [filterType]: checked });
  };

  const handleCategoryChange = (category) => {
    const currentCategories = filters.categories || [];
    const newCategories = currentCategories.includes(category)
      ? currentCategories.filter(c => c !== category)
      : [...currentCategories, category];
    onFilterChange({ categories: newCategories });
  };


  const handleMaterialChange = (material) => {
    const currentMaterials = filters.materials || [];
    const newMaterials = currentMaterials.includes(material)
      ? currentMaterials.filter(m => m !== material)
      : [...currentMaterials, material];
    onFilterChange({ materials: newMaterials });
  };

  const handlePriceRangeChange = (newRange) => {
    setPriceRange(newRange);
    onFilterChange({ priceRange: `${newRange[0]}-${newRange[1]}` });
  };

  const clampPriceValue = (value) => {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return priceRangeData.min;
    return Math.min(Math.max(numeric, priceRangeData.min), priceRangeData.max);
  };

  const handleMinPriceChange = (value) => {
    const clamped = clampPriceValue(value);
    const newMin = Math.min(clamped, priceRange[1] - 1);
    handlePriceRangeChange([newMin, priceRange[1]]);
  };

  const handleMaxPriceChange = (value) => {
    const clamped = clampPriceValue(value);
    const newMax = Math.max(clamped, priceRange[0] + 1);
    handlePriceRangeChange([priceRange[0], newMax]);
  };

  const extractMaterialsFromProducts = (productList = []) => {
    const materials = productList
      .map((product) => product?.material || product?.Material || product?.materialName)
      .filter(Boolean)
      .flatMap((materialValue) =>
        String(materialValue)
          .split(",")
          .map((material) => material.trim())
          .filter((material) => material.length > 0)
      );

    return [...new Set(materials)];
  };

  const extractNumericProductId = (product) => {
    const directId = Number(product?.id);
    if (Number.isFinite(directId) && directId > 0) {
      return directId;
    }

    const slug = String(product?.slug || "");
    const slugMatch = slug.match(/(\d+)$/);
    if (slugMatch) {
      const parsed = Number(slugMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  };

  // Use props data first, then fetch from API if needed
  useEffect(() => {
    // If categories are provided as props, use them
    if (categories && categories.length > 0) {
      const processedCategories = categories.map(cat => 
        typeof cat === 'object' && cat.name ? cat.name : String(cat || '').trim()
      ).filter(cat => cat.length > 0);
      setRealCategories(processedCategories);
    }
    
    // If products are provided, extract categories from them
    if (products && products.length > 0) {
      const uniqueCategories = [...new Set(
        products
          .map(product => product.categoryName)
          .filter(Boolean)
          .map(category => String(category).trim())
          .filter(category => category.length > 0)
      )];
      
      if (uniqueCategories.length > 0) {
        setRealCategories(uniqueCategories);
      }
    }
    
    const productMaterials = extractMaterialsFromProducts(products || []);
    if (productMaterials.length > 0) {
      setRealMaterials(productMaterials);
    } else {
      setRealMaterials([]);
    }

    // Fetch additional data from API (price range, stock status, materials)
    const fetchAdditionalData = async () => {
      try {
        setLoading(true);
        
        const [materialsResponse, priceRangeResponse, stockStatusResponse] = await Promise.all([
          apiClient.get('/api/public/materials'),
          apiClient.get('/api/public/price-range'),
          apiClient.get('/api/public/stock-status')
        ]);
        
        // Set materials (only if backend returns real values)
        if (materialsResponse.success && materialsResponse.materials) {
          const apiMaterials = materialsResponse.materials.map(mat => 
            typeof mat === 'object' && mat.name ? mat.name : String(mat || '').trim()
          ).filter(mat => mat.length > 0);

          if (apiMaterials.length > 0) {
            setRealMaterials([...new Set(apiMaterials)]);
          } else {
            // Fallback: derive materials from product-level materials endpoint.
            const numericIds = [...new Set((products || [])
              .map(extractNumericProductId)
              .filter(Boolean))];

            if (numericIds.length > 0) {
              const materialResults = await Promise.all(
                numericIds.map(async (productId) => {
                  try {
                    const response = await apiClient.get(`/api/products/${productId}/materials`);
                    if (response?.success && Array.isArray(response.materials)) {
                      return response.materials
                        .map((item) => String(item?.MaterialName || "").trim())
                        .filter((name) => name.length > 0);
                    }
                  } catch (materialFetchError) {
                    console.warn(`Failed loading materials for product ${productId}:`, materialFetchError);
                  }
                  return [];
                })
              );

              const derivedMaterials = [...new Set(materialResults.flat())];
              if (derivedMaterials.length > 0) {
                setRealMaterials(derivedMaterials);
              }
            }
          }
        }
        
        // Set price range
        if (priceRangeResponse.success && priceRangeResponse.priceRange) {
          const { min, max } = priceRangeResponse.priceRange;
          setPriceRangeData({ min, max });
          setPriceRange([min, max]);
        }
        
        // Set stock status
        if (stockStatusResponse.success && stockStatusResponse.stockStatus) {
          setStockStatus(stockStatusResponse.stockStatus);
        } else {
          // Fallback: calculate stock status from products data
          if (products && products.length > 0) {
            const inStockCount = products.filter(product => {
              const currentStock = getSellableStock(product);
              return currentStock > 0;
            }).length;
            
            const outOfStockCount = products.filter(product => {
              const currentStock = getSellableStock(product);
              return currentStock === 0;
            }).length;
            
            setStockStatus({ inStock: inStockCount, outOfStock: outOfStockCount });
          }
        }
        
      } catch (error) {
        console.error('Error fetching additional filter data:', error);
        
        // Fallback: calculate stock status from products data
        if (products && products.length > 0) {
          const inStockCount = products.filter(product => {
            const currentStock = getSellableStock(product);
            return currentStock > 0;
          }).length;
          
          const outOfStockCount = products.filter(product => {
            const currentStock = getSellableStock(product);
            return currentStock === 0;
          }).length;
          
          setStockStatus({ inStock: inStockCount, outOfStock: outOfStockCount });
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchAdditionalData();
  }, [products, categories]);

  // Use extracted data or fallback to props/empty arrays
  const categoryOptions = realCategories.length > 0 ? realCategories : (categories || []).map(cat => 
    typeof cat === 'object' && cat.name ? cat.name : String(cat || '').trim()
  ).filter(cat => cat.length > 0);
  const materials = realMaterials;


  return (
    <div className="filter-sidebar-new">
      <h3 className="filter-title">Filter Options</h3>
      
      {/* Category */}
      <div className="filter-section-new">
        <h4>Category</h4>
        <div className="category-options">
          {categoryOptions.map(category => {
            // Handle both string and object formats
            const categoryName = typeof category === 'object' && category.name ? category.name : String(category || '').trim();
            const categoryLower = categoryName.toLowerCase();
            return (
              <label key={categoryName} className="category-option">
                <input
                  type="checkbox"
                  checked={(filters.categories || []).includes(categoryLower)}
                  onChange={() => handleCategoryChange(categoryLower)}
                />
                <span className="category-checkbox"></span>
                <span className="category-name">{categoryName}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Price */}
      <div className="filter-section-new">
        <h4>Price</h4>
        {loading ? (
          <div className="loading-text">Loading price range...</div>
        ) : (
          <>
            <div className="price-range-display">
              ₱{priceRange[0].toLocaleString()} - ₱{priceRange[1].toLocaleString()}
            </div>
            <div className="price-slider-container">
              <div className="price-slider-wrapper">
                <div className="price-slider-track"></div>
                <div 
                  className="price-slider-range"
                  style={{
                    left: `${((priceRange[0] - priceRangeData.min) / (priceRangeData.max - priceRangeData.min)) * 100}%`,
                    width: `${((priceRange[1] - priceRange[0]) / (priceRangeData.max - priceRangeData.min)) * 100}%`
                  }}
                ></div>
                <input
                  type="range"
                  min={priceRangeData.min}
                  max={priceRangeData.max}
                  value={priceRange[0]}
                  onChange={(e) => handleMinPriceChange(e.target.value)}
                  className="price-slider price-slider-min"
                />
                <input
                  type="range"
                  min={priceRangeData.min}
                  max={priceRangeData.max}
                  value={priceRange[1]}
                  onChange={(e) => handleMaxPriceChange(e.target.value)}
                  className="price-slider price-slider-max"
                />
              </div>
            </div>
            <div className="price-inputs">
              <div className="price-input-group">
                <label>Min Price</label>
                <input
                  type="number"
                  min={priceRangeData.min}
                  max={priceRangeData.max}
                  value={priceRange[0]}
                  onChange={(e) => handleMinPriceChange(e.target.value)}
                  placeholder="Min"
                />
              </div>
              <div className="price-input-group">
                <label>Max Price</label>
                <input
                  type="number"
                  min={priceRangeData.min}
                  max={priceRangeData.max}
                  value={priceRange[1]}
                  onChange={(e) => handleMaxPriceChange(e.target.value)}
                  placeholder="Max"
                />
              </div>
            </div>
          </>
        )}
      </div>


      {/* Material */}
      {materials.length > 0 && (
        <div className="filter-section-new">
          <h4>Material</h4>
          <div className="material-options">
            {materials.map(material => {
              // Handle both string and object formats
              const materialName = typeof material === 'object' && material.name ? material.name : String(material || '').trim();
              const materialLower = materialName.toLowerCase();
              return (
                <label key={materialName} className="material-option">
                  <input
                    type="checkbox"
                    checked={(filters.materials || []).includes(materialLower)}
                    onChange={() => handleMaterialChange(materialLower)}
                  />
                  <span className="material-checkbox"></span>
                  <span className="material-name">{materialName}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Availability */}
      <div className="filter-section-new">
        <h4>Availability</h4>
        {loading ? (
          <div className="loading-text">Loading stock status...</div>
        ) : (
          <div className="availability-options">
            <label className="availability-option">
              <input
                type="checkbox"
                checked={filters.inStock}
                onChange={(e) => handleCheckboxChange("inStock", e.target.checked)}
              />
              <span className="availability-checkbox"></span>
              <span className="availability-name">
                In Stock ({stockStatus.inStock || 0})
              </span>
            </label>
            <label className="availability-option">
              <input
                type="checkbox"
                checked={filters.outOfStock}
                onChange={(e) => handleCheckboxChange("outOfStock", e.target.checked)}
              />
              <span className="availability-checkbox"></span>
              <span className="availability-name">
                Out of Stock ({stockStatus.outOfStock || 0})
              </span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductFilter;
