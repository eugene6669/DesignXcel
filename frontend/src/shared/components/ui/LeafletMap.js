import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const LeafletMap = ({ 
  center = [14.640700042873558, 121.00340179095328], // Updated precise coordinates
  zoom = 13,
  height = '450px',
  width = '100%',
  markerTitle = 'Design Excellence Location',
  markerPopup = '1 Binmaka St, cor Biak na Bato, Quezon City, 1115 Kalakhang Maynila'
}) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);

  useEffect(() => {
    let map = null;
    
    const initializeMap = () => {
      if (!mapRef.current || mapInstanceRef.current) return;
      
      try {
        // Force container to have dimensions on mobile (including 759px)
        const isMobile = window.innerWidth <= 1024;
        if (isMobile) {
          // Set explicit dimensions for mobile
          if (mapRef.current.style.height === 'auto' || !mapRef.current.style.height) {
            mapRef.current.style.height = '400px';
          }
          if (mapRef.current.style.width === 'auto' || !mapRef.current.style.width) {
            mapRef.current.style.width = '100%';
          }
        }
        
        // Ensure the container has dimensions
        if (mapRef.current.offsetWidth === 0 || mapRef.current.offsetHeight === 0) {
          // Retry after a longer delay on mobile
          const retryDelay = isMobile ? 300 : 100;
          setTimeout(initializeMap, retryDelay);
          return;
        }

        // Check if Leaflet is properly loaded
        if (typeof L === 'undefined' || !L.map) {
          console.error('Leaflet is not properly loaded');
          return;
        }

        // Initialize the map with proper error handling
        map = L.map(mapRef.current, {
          center: center,
          zoom: zoom,
          zoomControl: true,
          attributionControl: true,
          // Use SVG renderer on mobile for better compatibility
          renderer: isMobile ? L.svg() : L.canvas(),
          zoomAnimation: !isMobile, // Disable animations on mobile for better performance
          fadeAnimation: !isMobile,
          markerZoomAnimation: !isMobile,
          // Mobile-specific options
          tap: true,
          touchZoom: true,
          doubleClickZoom: true,
          boxZoom: false, // Disable box zoom on mobile
          keyboard: false, // Disable keyboard on mobile
          scrollWheelZoom: !isMobile // Disable scroll wheel zoom on mobile
        });

        mapInstanceRef.current = map;

        // Add OpenStreetMap tiles with error handling
        try {
          const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
            crossOrigin: true,
            errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' // Transparent 1x1 pixel as fallback
          }).addTo(map);
          
          // Handle tile loading errors
          tileLayer.on('tileerror', function(error, tile) {
            console.warn('Tile loading error:', error);
            // Retry loading the tile
            setTimeout(() => {
              if (map && map.hasLayer(tileLayer)) {
                tileLayer.redraw();
                // Invalidate size after redraw
                if (map.invalidateSize) {
                  map.invalidateSize(false);
                }
              }
            }, 1000);
          });
          
          // Force tile reload on mobile if tiles don't load
          if (isMobile) {
            setTimeout(() => {
              if (map && map.hasLayer(tileLayer)) {
                // Check if tiles are loaded
                const tilesLoaded = map.getContainer().querySelectorAll('.leaflet-tile-loaded').length;
                if (tilesLoaded === 0) {
                  // Force reload tiles
                  tileLayer.redraw();
                  if (map.invalidateSize) {
                    map.invalidateSize(false);
                  }
                }
              }
            }, 2000);
          }
        } catch (tileError) {
          console.error('Error adding tile layer:', tileError);
        }

        // Wait for map to be ready before adding marker
        map.whenReady(() => {
          try {
            const isMobile = window.innerWidth <= 1024;
            
            // Force invalidate size multiple times on mobile
            if (isMobile) {
              // Immediate invalidate
              if (map && map.invalidateSize) {
                map.invalidateSize(false);
              }
              
              // Multiple delayed invalidates for mobile - more aggressive
              [50, 100, 200, 300, 500, 800, 1000, 1500, 2000].forEach(delay => {
                setTimeout(() => {
                  if (map && map.invalidateSize) {
                    map.invalidateSize(false);
                    // Force redraw of all layers
                    if (map.eachLayer) {
                      map.eachLayer((layer) => {
                        if (layer.redraw) {
                          try {
                            layer.redraw();
                          } catch (e) {
                            // Ignore redraw errors
                          }
                        }
                      });
                    }
                  }
                }, delay);
              });
            } else {
              // Single invalidate for desktop
              setTimeout(() => {
                if (map && map.invalidateSize) {
                  map.invalidateSize();
                }
              }, 100);
            }

            // Add custom marker icon with your brand colors
            const customIcon = L.divIcon({
              className: 'custom-marker',
              html: `
                <div style="
                  background: linear-gradient(135deg, #F0B21B 0%, #e6a632 100%);
                  width: 30px;
                  height: 30px;
                  border-radius: 50% 50% 50% 0;
                  border: 3px solid #ffffff;
                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                  transform: rotate(-45deg);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  position: relative;
                ">
                  <div style="
                    transform: rotate(45deg);
                    color: #2c3e50;
                    font-weight: bold;
                    font-size: 14px;
                    line-height: 1;
                  ">DE</div>
                </div>
              `,
              iconSize: [30, 30],
              iconAnchor: [15, 30],
              popupAnchor: [0, -30]
            });

            // Add marker
            const marker = L.marker(center, { icon: customIcon }).addTo(map);
            marker.bindPopup(markerPopup).openPopup();

            // Fit map to show marker with some padding
            map.fitBounds([[center[0] - 0.01, center[1] - 0.01], [center[0] + 0.01, center[1] + 0.01]], {
              padding: [20, 20]
            });

            // Additional invalidate for mobile after fitBounds
            if (isMobile) {
              setTimeout(() => {
                if (map && map.invalidateSize) {
                  map.invalidateSize(false);
                  // Force a redraw
                  if (map && map.eachLayer) {
                    map.eachLayer((layer) => {
                      if (layer.redraw) {
                        layer.redraw();
                      }
                    });
                  }
                }
              }, 400);
            }

            setIsMapReady(true);
          } catch (markerError) {
            console.error('Error adding marker:', markerError);
            // Fallback to default marker
            const marker = L.marker(center).addTo(map);
            marker.bindPopup(markerPopup).openPopup();
            
            // Invalidate size for fallback
            setTimeout(() => {
              if (map && map.invalidateSize) {
                map.invalidateSize();
              }
            }, 300);
            
            setIsMapReady(true);
          }
        });

      } catch (error) {
        console.error('Error initializing map:', error);
        setIsMapReady(false);
      }
    };

    // Initialize map with a delay - longer on mobile (including 759px)
    const isMobile = window.innerWidth <= 1024;
    const initDelay = isMobile ? 300 : 100;
    const timer = setTimeout(initializeMap, initDelay);

    // Handle window resize and orientation change for mobile (including 759px)
    const handleResize = () => {
      if (mapInstanceRef.current && mapInstanceRef.current.invalidateSize) {
        const isMobile = window.innerWidth <= 1024;
        if (isMobile) {
          // More aggressive invalidation on mobile/tablet
          setTimeout(() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.invalidateSize(false);
              // Force redraw all layers
              if (mapInstanceRef.current.eachLayer) {
                mapInstanceRef.current.eachLayer((layer) => {
                  if (layer.redraw) {
                    try {
                      layer.redraw();
                    } catch (e) {
                      // Ignore redraw errors
                    }
                  }
                });
              }
            }
          }, 100);
        } else {
          setTimeout(() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.invalidateSize();
            }
          }, 100);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    // Cleanup function
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      
      if (mapInstanceRef.current) {
        try {
          // Remove all event listeners first
          if (mapInstanceRef.current.off) {
            mapInstanceRef.current.off();
          }
          
          // Remove all layers
          if (mapInstanceRef.current.eachLayer) {
            mapInstanceRef.current.eachLayer(function(layer) {
              try {
                mapInstanceRef.current.removeLayer(layer);
              } catch (layerError) {
                console.error('Error removing layer:', layerError);
              }
            });
          }
          
          // Remove the map instance
          if (mapInstanceRef.current.remove) {
            mapInstanceRef.current.remove();
          }
        } catch (error) {
          console.error('Error removing map:', error);
        } finally {
          mapInstanceRef.current = null;
        }
      }
      setIsMapReady(false);
    };
  }, [center, zoom, markerPopup]);

  return (
    <div 
      ref={mapRef} 
      style={{ 
        height: height, 
        width: width,
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        position: 'relative',
        minHeight: '300px', // Ensure minimum height to prevent dimension issues
        display: 'block' // Ensure block display for proper dimensions
      }}
      className={`leaflet-map-container ${!isMapReady ? 'loading' : ''}`}
    >
      {!isMapReady && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#6c757d',
          fontSize: '14px',
          zIndex: 1000
        }}>
          Loading map...
        </div>
      )}
    </div>
  );
};

export default LeafletMap;
