import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../features/products/components/ProductCard';
import Testimonials from '../shared/components/feedback/Testimonials';
import Hero from '../shared/components/layout/Hero';
import Slider from '../shared/components/ui/Slider';
import { ContactSection } from '../shared/components/layout';
import { getFeaturedProducts, productService } from '../features/products/services/productService';
import AudioLoader from '../shared/components/ui/AudioLoader';
import './pages.css';
import '../shared/components/ui/slider.css';

const Home = () => {
    // Featured Products
    const [featuredProducts, setFeaturedProducts] = useState([]);
    const [bestSellerProducts, setBestSellerProducts] = useState([]);
    const [newArrivalProducts, setNewArrivalProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Categories
    const [categories, setCategories] = useState([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    
    // Theme detection
    const [currentTheme, setCurrentTheme] = useState('default');
    
    // Remove old slider state - now handled by Slider component
    // const [currentSlide, setCurrentSlide] = useState(0);
    // const [itemsPerSlide, setItemsPerSlide] = useState(4);

    useEffect(() => {
        loadFeaturedProducts();
        loadCategories();
    }, []);

    // Detect current theme from body class
    useEffect(() => {
        const detectTheme = () => {
            const bodyClasses = document.body.className;
            if (bodyClasses.includes('theme-christmas')) {
                setCurrentTheme('christmas');
            } else if (bodyClasses.includes('theme-dark')) {
                setCurrentTheme('dark');
            } else {
                setCurrentTheme('default');
            }
        };

        // Initial detection
        detectTheme();

        // Listen for theme changes
        const observer = new MutationObserver(detectTheme);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        return () => observer.disconnect();
    }, []);

    const loadFeaturedProducts = async () => {
        try {
            // Try to get from the frontend API endpoint to get featured products with discounts
            const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
            const response = await fetch(`${apiBase}/api/products`);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.products) {
                    // Filter for featured products
                    const featured = data.products
                        .filter(p => p.featured)
                        .map(p => ({
                            id: p.id,
                            name: p.name,
                            description: p.description,
                            price: p.price,
                            image: p.images && p.images.length > 0 ? p.images[0] : null,
                            hasDiscount: p.hasDiscount,
                            discountInfo: p.discountInfo,
                            ...p
                        }));

                    const bestSellers = data.products
                        .filter(p => p.isBestSeller)
                        .map(p => ({
                            id: p.id,
                            name: p.name,
                            description: p.description,
                            price: p.price,
                            image: p.images && p.images.length > 0 ? p.images[0] : null,
                            hasDiscount: p.hasDiscount,
                            discountInfo: p.discountInfo,
                            ...p
                        }));

                    const newArrivals = data.products
                        .filter(p => p.isNewArrival)
                        .map(p => ({
                            id: p.id,
                            name: p.name,
                            description: p.description,
                            price: p.price,
                            image: p.images && p.images.length > 0 ? p.images[0] : null,
                            hasDiscount: p.hasDiscount,
                            discountInfo: p.discountInfo,
                            ...p
                        }));
                    
                    setFeaturedProducts(featured);
                    setBestSellerProducts(bestSellers);
                    setNewArrivalProducts(newArrivals);
                } else {
                    // If no featured products from backend, use mock data
                    const mockResponse = await getFeaturedProducts();
                    setFeaturedProducts(mockResponse.products || []);
                    setBestSellerProducts([]);
                    setNewArrivalProducts([]);
                }
            } else {
                // If backend is not available, use mock data
                const mockResponse = await getFeaturedProducts();
                setFeaturedProducts(mockResponse.products || []);
                setBestSellerProducts([]);
                setNewArrivalProducts([]);
            }
        } catch (error) {
            console.error('Error loading featured products:', error);
            // Fallback to mock data
            try {
                const mockResponse = await getFeaturedProducts();
                setFeaturedProducts(mockResponse.products || []);
                setBestSellerProducts([]);
                setNewArrivalProducts([]);
            } catch (mockError) {
                console.error('Error loading mock products:', mockError);
                setFeaturedProducts([]);
                setBestSellerProducts([]);
                setNewArrivalProducts([]);
            }
        } finally {
            setLoading(false);
        }
    };

    const loadCategories = async () => {
        try {
            setCategoriesLoading(true);
            const categoriesData = await productService.getCategoriesWithCounts();
            
            // Add icons and transform the data
            const categoriesWithIcons = categoriesData.map(category => ({
                ...category,
                id: category.name.toLowerCase().replace(/\s+/g, '-'),
                icon: getCategoryIcon(category.name)
            }));
            
            setCategories(categoriesWithIcons);
        } catch (error) {
            console.error('Error loading categories:', error);
            // Fallback to default categories if API fails
            setCategories(getDefaultCategories());
        } finally {
            setCategoriesLoading(false);
        }
    };

    // Helper function to get category icon based on category name
    const getCategoryIcon = (categoryName) => {
        const name = (categoryName || '').toLowerCase();

        // Cabinet icon (two-door cabinet with handles)
        const CabinetIcon = (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="#F0B21B" strokeWidth="2"/>
                <line x1="12" y1="3" x2="12" y2="21" stroke="#F0B21B" strokeWidth="2"/>
                <circle cx="9" cy="12" r="1" fill="#F0B21B"/>
                <circle cx="15" cy="12" r="1" fill="#F0B21B"/>
                <line x1="6" y1="21" x2="6" y2="23" stroke="#F0B21B" strokeWidth="2"/>
                <line x1="18" y1="21" x2="18" y2="23" stroke="#F0B21B" strokeWidth="2"/>
            </svg>
        );

        const DeskIcon = (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Desk surface */}
                <rect x="2" y="6" width="20" height="2" rx="1" fill="#F0B21B" fillOpacity="0.2"/>
                <rect x="2" y="6" width="20" height="2" rx="1" stroke="#F0B21B" strokeWidth="1.5"/>
                
                {/* Desk legs */}
                <rect x="3" y="8" width="1.5" height="12" fill="#F0B21B" fillOpacity="0.3"/>
                <rect x="19.5" y="8" width="1.5" height="12" fill="#F0B21B" fillOpacity="0.3"/>
                <rect x="10" y="8" width="1.5" height="12" fill="#F0B21B" fillOpacity="0.3"/>
                <rect x="12.5" y="8" width="1.5" height="12" fill="#F0B21B" fillOpacity="0.3"/>
                
                {/* Drawer */}
                <rect x="4" y="7" width="6" height="1.5" rx="0.5" fill="#F0B21B" fillOpacity="0.1"/>
                <rect x="4" y="7" width="6" height="1.5" rx="0.5" stroke="#F0B21B" strokeWidth="0.8"/>
                <circle cx="6.5" cy="7.75" r="0.3" fill="#F0B21B"/>
                
                {/* Monitor stand */}
                <rect x="12" y="5" width="8" height="1" rx="0.5" fill="#F0B21B" fillOpacity="0.2"/>
                <rect x="12" y="5" width="8" height="1" rx="0.5" stroke="#F0B21B" strokeWidth="0.8"/>
                
                {/* Monitor */}
                <rect x="13" y="2" width="6" height="4" rx="0.5" fill="#F0B21B" fillOpacity="0.1"/>
                <rect x="13" y="2" width="6" height="4" rx="0.5" stroke="#F0B21B" strokeWidth="0.8"/>
                <rect x="14" y="3" width="4" height="2" rx="0.3" fill="#F0B21B" fillOpacity="0.3"/>
            </svg>
        );

        const ChairIcon = (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Chair back */}
                <rect x="6" y="3" width="12" height="8" rx="1" fill="#F0B21B" fillOpacity="0.1"/>
                <rect x="6" y="3" width="12" height="8" rx="1" stroke="#F0B21B" strokeWidth="1.5"/>
                
                {/* Chair seat */}
                <rect x="4" y="10" width="16" height="3" rx="1" fill="#F0B21B" fillOpacity="0.2"/>
                <rect x="4" y="10" width="16" height="3" rx="1" stroke="#F0B21B" strokeWidth="1.5"/>
                
                {/* Armrests */}
                <rect x="3" y="8" width="2" height="4" rx="1" fill="#F0B21B" fillOpacity="0.3"/>
                <rect x="19" y="8" width="2" height="4" rx="1" fill="#F0B21B" fillOpacity="0.3"/>
                
                {/* Chair legs */}
                <rect x="5" y="13" width="1.5" height="8" fill="#F0B21B" fillOpacity="0.4"/>
                <rect x="17.5" y="13" width="1.5" height="8" fill="#F0B21B" fillOpacity="0.4"/>
                <rect x="5" y="13" width="1.5" height="8" stroke="#F0B21B" strokeWidth="0.8"/>
                <rect x="17.5" y="13" width="1.5" height="8" stroke="#F0B21B" strokeWidth="0.8"/>
                
                {/* Back support bars */}
                <line x1="8" y1="5" x2="16" y2="5" stroke="#F0B21B" strokeWidth="1"/>
                <line x1="8" y1="7" x2="16" y2="7" stroke="#F0B21B" strokeWidth="1"/>
                
                {/* Footrest */}
                <rect x="6" y="20" width="12" height="1" rx="0.5" fill="#F0B21B" fillOpacity="0.3"/>
            </svg>
        );

        const StorageIcon = (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#F0B21B" strokeWidth="2"/>
                <polyline points="14,2 14,8 20,8" stroke="#F0B21B" strokeWidth="2"/>
                <line x1="16" y1="13" x2="8" y2="13" stroke="#F0B21B" strokeWidth="2"/>
                <line x1="16" y1="17" x2="8" y2="17" stroke="#F0B21B" strokeWidth="2"/>
                <polyline points="10,9 9,9 8,9" stroke="#F0B21B" strokeWidth="2"/>
            </svg>
        );

        const ConferenceIcon = (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 21h18" stroke="#F0B21B" strokeWidth="2"/>
                <path d="M5 21V7l8-4v18" stroke="#F0B21B" strokeWidth="2"/>
                <path d="M19 21V11l-6-4" stroke="#F0B21B" strokeWidth="2"/>
                <path d="M9 9v.01" stroke="#F0B21B" strokeWidth="2"/>
                <path d="M9 12v.01" stroke="#F0B21B" strokeWidth="2"/>
                <path d="M9 15v.01" stroke="#F0B21B" strokeWidth="2"/>
                <path d="M9 18v.01" stroke="#F0B21B" strokeWidth="2"/>
            </svg>
        );

        const AccessoriesIcon = (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="#F0B21B" strokeWidth="2"/>
            </svg>
        );

        // Case-insensitive mapping by substring
        if (name.includes('cabinet') || name.includes('cupboard') || name.includes('locker')) {
            return CabinetIcon;
        }
        if (name.includes('desk') || name.includes('table')) {
            return DeskIcon;
        }
        if (name.includes('chair') || name.includes('stool') || name.includes('seating')) {
            return ChairIcon;
        }
        if (name.includes('storage') || name.includes('shelf') || name.includes('shelving') || name.includes('drawer')) {
            return StorageIcon;
        }
        if (name.includes('conference') || name.includes('meeting')) {
            return ConferenceIcon;
        }
        if (name.includes('accessor')) {
            return AccessoriesIcon;
        }

        // Fallback default icon
        return (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="#F0B21B" strokeWidth="2"/>
            </svg>
        );
    };

    // Default categories fallback
    const getDefaultCategories = () => [
        {
            id: 'desks',
            name: 'Office Desks',
            count: 12,
            icon: getCategoryIcon('Desk'),
            categoryName: 'Desk'
        },
        {
            id: 'chairs',
            name: 'Office Chairs',
            count: 8,
            icon: getCategoryIcon('Chair'),
            categoryName: 'Chair'
        },
        {
            id: 'storage',
            name: 'Storage Solutions',
            count: 15,
            icon: getCategoryIcon('Storage'),
            categoryName: 'Storage'
        },
        {
            id: 'conference',
            name: 'Conference Furniture',
            count: 6,
            icon: getCategoryIcon('Conference'),
            categoryName: 'Conference'
        },
        {
            id: 'accessories',
            name: 'Office Accessories',
            count: 20,
            icon: getCategoryIcon('Accessories'),
            categoryName: 'Accessories'
        }
    ];

    // Testimonials state
    const [testimonials, setTestimonials] = useState([]);
    const [testimonialIndex, setTestimonialIndex] = useState(0);
    
    // Testimonials design settings state
    const [testimonialsDesign, setTestimonialsDesign] = useState({
        theme: 'default',
        layout: 'grid',
        perRow: '3',
        animation: 'none',
        bgColor: '#ffffff',
        textColor: '#333333',
        accentColor: '#ffc107',
        borderRadius: '8',
        showRating: true,
        showImage: true,
        showTitle: true,
        textAlign: 'left'
    });
    
    // Hero banner settings state
    const [heroBanner, setHeroBanner] = useState({
        mainHeading: 'Premium Office Furniture Solutions',
        descriptionLine1: 'Transform your workspace with our premium collection of office furniture',
        descriptionLine2: 'Discover our premium collection of office furniture designed for modern professionals',
        buttonText: 'SHOP NOW',
        buttonLink: '/products',
        textColor: '#ffffff',
        buttonBgColor: '#ffc107',
        buttonTextColor: '#333333',
        heroBannerImages: []
    });

    // Carousel state
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    useEffect(() => {
        // Fetch testimonials
        const apiBase2 = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        fetch(`${apiBase2}/api/testimonials`)
            .then(res => res.json())
            .then(data => setTestimonials(data.testimonials || []))
            .catch(() => setTestimonials([]));
        
        // Fetch testimonials design settings
        fetch(`${apiBase2}/api/testimonials-design`)
            .then(res => res.json())
            .then(data => {
                console.log('Testimonials design settings loaded:', data);
                setTestimonialsDesign(data);
            })
            .catch((error) => {
                // Use default values if API fails
                console.log('Using default testimonials design settings due to error:', error);
            });
        
        // Fetch hero banner settings
        fetch(`${apiBase2}/api/hero-banner`)
            .then(res => res.json())
            .then(data => {
                console.log('Hero banner settings loaded:', data);
                if (data.success && data.heroBanner) {
                    setHeroBanner(data.heroBanner);
                } else {
                    console.log('Hero banner data format issue:', data);
                }
            })
            .catch((error) => {
                // Use default values if API fails
                console.log('Using default hero banner settings due to error:', error);
            });
    }, []);

    // Auto-rotate hero banner images
    useEffect(() => {
        if (heroBanner.heroBannerImages && heroBanner.heroBannerImages.length > 1) {
            const interval = setInterval(() => {
                setCurrentImageIndex(prev => (prev + 1) % heroBanner.heroBannerImages.length);
            }, 4000); // Change every 4 seconds
            
            return () => clearInterval(interval);
        }
    }, [heroBanner.heroBannerImages]);

    const handlePrevTestimonial = () => {
        setTestimonialIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
    };
    const handleNextTestimonial = () => {
        setTestimonialIndex((prev) => (prev + 1) % testimonials.length);
    };

    const currentTestimonial = testimonials[testimonialIndex] || {};
    const DEFAULT_IMAGE = '/placeholder.png'; // Place this in your public folder

    // Slider navigation functions removed - now handled by Slider component

    if (loading) {
        return (
            <div className="home">
                <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    minHeight: '50vh',
                    gap: '1rem'
                }}>
                    <AudioLoader size="large" color="#F0B21B" />
                    <p>Loading featured products...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="home">
            <>
                <style>
                {`
                    /* Testimonials Theme Styles */
                    .testimonials-container {
                        margin-top: 2rem;
                    }
                    
                    /* Default Theme */
                    .testimonial-item.testimonial-default {
                        background: rgba(255, 255, 255, 0.9);
                        padding: 20px;
                        border: 1px solid #ddd;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        text-align: center;
                        backdrop-filter: blur(10px);
                    }
                    
                    /* Modern Theme */
                    .testimonial-item.testimonial-modern {
                        background: linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 249, 250, 0.9) 100%);
                        padding: 25px;
                        border: none;
                        box-shadow: 0 8px 25px rgba(0,0,0,0.1);
                        text-align: center;
                        transition: transform 0.3s ease;
                        backdrop-filter: blur(10px);
                    }
                    
                    .testimonial-item.testimonial-modern:hover {
                        transform: translateY(-5px);
                    }
                    
                    /* Minimal Theme */
                    .testimonial-item.testimonial-minimal {
                        background: transparent;
                        padding: 20px;
                        border-left: 3px solid;
                        box-shadow: none;
                        text-align: left;
                    }
                    
                    /* Elegant Theme */
                    .testimonial-item.testimonial-elegant {
                        background: rgba(255, 255, 255, 0.9);
                        padding: 30px;
                        border: 1px solid #e0e0e0;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
                        text-align: left;
                        position: relative;
                        backdrop-filter: blur(10px);
                    }
                    
                    .testimonial-item.testimonial-elegant {
                        position: relative;
                    }
                    
                    .elegant-quote-mark {
                        z-index: 1;
                    }
                    
                    /* Bold Theme */
                    .testimonial-item.testimonial-bold {
                        background: inherit;
                        color: white;
                        padding: 25px;
                        border: none;
                        box-shadow: 0 6px 20px rgba(0,0,0,0.2);
                        text-align: center;
                        transform: rotate(-1deg);
                    }
                    
                    /* Animation Classes */
                    .testimonials-container[style*="fade"] .testimonial-item {
                        opacity: 0;
                        animation: fadeIn 0.6s ease-out forwards;
                    }
                    
                    .testimonials-container[style*="slide"] .testimonial-item {
                        opacity: 0;
                        transform: translateY(30px);
                        animation: slideUp 0.6s ease-out forwards;
                    }
                    
                    .testimonials-container[style*="bounce"] .testimonial-item {
                        opacity: 0;
                        animation: bounceIn 0.6s ease-out forwards;
                    }
                    
                    .testimonials-container[style*="zoom"] .testimonial-item {
                        opacity: 0;
                        transform: scale(0.8);
                        animation: zoomIn 0.6s ease-out forwards;
                    }
                    
                    /* Animation Keyframes */
                    @keyframes fadeIn {
                        to { opacity: 1; }
                    }
                    
                    @keyframes slideUp {
                        to { 
                            opacity: 1; 
                            transform: translateY(0); 
                        }
                    }
                    
                    @keyframes bounceIn {
                        0% { opacity: 0; transform: scale(0.3); }
                        50% { opacity: 1; transform: scale(1.05); }
                        70% { transform: scale(0.9); }
                        100% { opacity: 1; transform: scale(1); }
                    }
                    
                    @keyframes zoomIn {
                        to { 
                            opacity: 1; 
                            transform: scale(1); 
                        }
                    }

                    @keyframes bestSellerSlideIn {
                        from {
                            opacity: 0;
                            transform: translateX(14px);
                        }
                        to {
                            opacity: 1;
                            transform: translateX(0);
                        }
                    }

                    @keyframes bestSellerPulse {
                        0%, 100% { box-shadow: 0 0 0 rgba(240, 178, 27, 0.1); }
                        50% { box-shadow: 0 10px 24px rgba(240, 178, 27, 0.2); }
                    }

                    @keyframes newArrivalFloatIn {
                        from {
                            opacity: 0;
                            transform: translateY(16px) scale(0.98);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0) scale(1);
                        }
                    }
                    
                    /* Testimonials Grid */
                    .testimonials-grid {
                        margin-top: 2rem;
                    }
                    
                    .testimonial-item {
                        margin-bottom: 1rem;
                    }
                    
                    .testimonial-image {
                        text-align: center;
                        margin-bottom: 15px;
                    }
                    
                    .testimonial-text {
                        margin-bottom: 15px;
                        font-style: italic;
                        line-height: 1.6;
                    }
                    
                    .testimonial-author {
                        text-align: center;
                        margin-bottom: 15px;
                    }
                    
                    .testimonial-author h4 {
                        margin: 0 0 5px 0;
                        font-size: 18px;
                    }
                    
                    .testimonial-author p {
                        margin: 0;
                        color: #666;
                        font-size: 14px;
                    }
                    
                    .testimonial-stars {
                        text-align: center;
                        font-size: 18px;
                    }
                    
                    .star {
                        margin: 0 2px;
                    }
                    
                    /* Hero Carousel Styles */
                    .hero {
                        position: relative;
                        overflow: hidden;
                    }
                    
                    .hero-navigation {
                        position: absolute;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 100%;
                        display: flex;
                        justify-content: space-between;
                        padding: 0 20px;
                        z-index: 10;
                    }
                    
                    .nav-arrow {
                        background: rgba(0, 0, 0, 0.5);
                        color: white;
                        border: none;
                        border-radius: 50%;
                        width: 50px;
                        height: 50px;
                        font-size: 24px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    
                    .nav-arrow:hover {
                        background: rgba(0, 0, 0, 0.8);
                        transform: scale(1.1);
                    }
                    
                    .hero-indicators {
                        position: absolute;
                        bottom: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        display: flex;
                        gap: 10px;
                        z-index: 10;
                    }
                    
                    .indicator {
                        width: 12px;
                        height: 12px;
                        border-radius: 50%;
                        background: rgba(255, 255, 255, 0.5);
                        transition: all 0.3s ease;
                    }
                    
                    .indicator.active {
                        background: rgba(255, 255, 255, 0.9);
                        transform: scale(1.2);
                    }
                    
                    .indicator:hover {
                        background: rgba(255, 255, 255, 0.8);
                    }
                    
                    /* Responsive Design */
                    @media (max-width: 768px) {
                        .testimonials-grid {
                            grid-template-columns: 1fr !important;
                        }
                        
                        .nav-arrow {
                            width: 40px;
                            height: 40px;
                            font-size: 20px;
                        }
                    }
                    
                    @media (max-width: 1024px) {
                        .testimonials-grid {
                            grid-template-columns: repeat(2, 1fr) !important;
                        }
                    }
                `}
            </style>
            <div className="home">
            <div className="home-main-content">
            {/* Modern Hero Section */}
            <Hero />

            {/* Featured Categories */}
            <section className="featured-categories">
                <div className="container">
                    <div className="section-header">
                        <h2>Featured Categories</h2>
                        <Link to="/products" className="view-all">View All Categories →</Link>
                    </div>
                    {categoriesLoading ? (
                        <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            padding: '2rem',
                            gap: '1rem'
                        }}>
                            <AudioLoader size="medium" color="#F0B21B" />
                            <p>Loading categories...</p>
                        </div>
                    ) : (
                        <>
                            {/* Desktop Layout - Grid if < 6 items, Slider if >= 6 items */}
                            {categories.length < 6 ? (
                                <div className="categories-grid desktop-only">
                                    {categories.map((category, index) => (
                                        <Link
                                            key={index}
                                            to={`/products?category=${encodeURIComponent(category.categoryName)}`}
                                            className="category-card"
                                        >
                                            <div className="category-icon">{category.icon}</div>
                                            <h3>{category.name}</h3>
                                            <p>{category.count} Products</p>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <Slider 
                                    itemsPerView={4}
                                    showArrows={true}
                                    showDots={true}
                                    autoPlay={true}
                                    autoPlayInterval={4000}
                                    className="categories-slider desktop-only"
                                >
                                    {categories.map((category, index) => (
                                        <Link
                                            key={index}
                                            to={`/products?category=${encodeURIComponent(category.categoryName)}`}
                                            className="category-card"
                                        >
                                            <div className="category-icon">{category.icon}</div>
                                            <h3>{category.name}</h3>
                                            <p>{category.count} Products</p>
                                        </Link>
                                    ))}
                                </Slider>
                            )}
                            
                            {/* Mobile Slider Layout */}
                            <Slider 
                                itemsPerView={4}
                                showArrows={true}
                                showDots={true}
                                autoPlay={true}
                                autoPlayInterval={4000}
                                className="categories-slider mobile-only"
                            >
                                {categories.map((category, index) => (
                                    <Link
                                        key={index}
                                        to={`/products?category=${encodeURIComponent(category.categoryName)}`}
                                        className="category-card"
                                    >
                                        <div className="category-icon">{category.icon}</div>
                                        <h3>{category.name}</h3>
                                        <p>{category.count} Products</p>
                                    </Link>
                                ))}
                            </Slider>
                        </>
                    )}
                </div>
            </section>

            {/* Featured Products */}
            <section className="featured-products">
                <div className="container">
                    <div className="section-header">
                        <h2>Featured Products</h2>
                        <Link to="/products" className="view-all">View All Products →</Link>
                    </div>
                    <>
                        {/* Desktop Layout - Grid if < 6 items, Slider if >= 6 items */}
                        {featuredProducts.length < 6 ? (
                            <div className="products-grid desktop-only">
                                {featuredProducts.map(product => (
                                    <ProductCard key={product.id} product={product} />
                                ))}
                            </div>
                        ) : (
                            <Slider 
                                itemsPerView={4}
                                showArrows={true}
                                showDots={true}
                                autoPlay={true}
                                autoPlayInterval={5000}
                                className="products-slider desktop-only"
                            >
                                {featuredProducts.map(product => (
                                    <ProductCard key={product.id} product={product} />
                                ))}
                            </Slider>
                        )}
                        
                        {/* Mobile Slider Layout */}
                        <Slider 
                            itemsPerView={4}
                            showArrows={true}
                            showDots={true}
                            autoPlay={true}
                            autoPlayInterval={5000}
                            className="products-slider mobile-only"
                        >
                            {featuredProducts.map(product => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </Slider>
                    </>
                </div>
            </section>

            <section className="best-seller-section">
                <div className="container">
                    <div className="section-header section-header--best-seller">
                        <div className="section-header-title-wrap">
                            <h2>Best Seller</h2>
                            <p className="section-header-sub">Top picks customers love right now</p>
                        </div>
                        <Link to="/products?sort=popular" className="view-all view-all--section">View Best Sellers →</Link>
                    </div>
                    {bestSellerProducts.length > 0 ? (
                        <div className="best-seller-layout">
                            <div className="best-seller-hero">
                                <span className="best-seller-hero-badge" aria-hidden="true">#1</span>
                                <div className="best-seller-hero-card">
                                    <ProductCard product={bestSellerProducts[0]} />
                                </div>
                            </div>
                            <div className="best-seller-rank-list">
                                {bestSellerProducts.slice(1, 4).map((product, index) => (
                                    <div key={`best-${product.id}`} className="best-seller-rank-card">
                                        <span className="best-seller-rank-num" aria-hidden="true">#{index + 2}</span>
                                        <ProductCard product={product} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="section-empty-note">No best seller products selected yet.</p>
                    )}
                </div>
            </section>

            <section className="new-arrival-section">
                <div className="container">
                    <div className="section-header section-header--new-arrival">
                        <div className="section-header-title-wrap">
                            <span className="section-eyebrow">Just landed</span>
                            <h2>New Arrival</h2>
                            <p className="section-header-sub">Fresh styles added to the showroom</p>
                        </div>
                        <Link to="/products?sort=newest" className="view-all view-all--section">View New Arrivals →</Link>
                    </div>
                    {newArrivalProducts.length > 0 ? (
                        <div className="new-arrival-grid">
                            {newArrivalProducts.map((product, index) => (
                                <div
                                    key={`new-${product.id}`}
                                    className={`new-arrival-card ${index % 3 === 1 ? 'new-arrival-card--featured' : ''}`}
                                    style={{ animationDelay: `${index * 0.08}s` }}
                                >
                                    <span className="new-arrival-ribbon">NEW</span>
                                    <ProductCard product={product} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="section-empty-note">No new arrival products selected yet.</p>
                    )}
                </div>
            </section>

            {/* Modern Testimonials Section */}
            <Testimonials designSettings={testimonialsDesign} />
            
            {/* Contact Section with Map */}
            <ContactSection />
            </div>
        </div>
        </>
        </div>
    );
};

export default Home;