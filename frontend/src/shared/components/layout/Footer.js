import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChristmasIcons } from '../christmas';

const Footer = () => {
  const [contactData, setContactData] = useState({
    email: 'info@designxcel.com',
    phone: '+1 (555) 123-4567',
    address: '123 Business District, Office Plaza, Suite 500, Metro City, MC 12345'
  });
  const [currentTheme, setCurrentTheme] = useState('default');

  // Fetch contact data from the same API endpoint as header
  useEffect(() => {
    const fetchContactData = async () => {
      try {
        const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        const response = await fetch(`${apiBase}/api/header-banner`);
        if (response.ok) {
          const data = await response.json();
          if (data) {
            setContactData({
              email: data.contactEmail || 'designexcellence1@gmail.com',
              phone: data.contactPhone || '(02) 413-6682',
              address: data.contactAddress || '#1 Binmaka Street Cor. Biak na Bato Brgy. Manresa, Quezon City'
            });
          }
        }
      } catch (error) {
        // Error fetching contact data - keep default values
      }
    };

    fetchContactData();
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

  return (
    <footer className="footer-main">
      <div className="footer-container">
        {/* Main Footer Content */}
        <div className="footer-content">
          {/* Left Section - Company Info */}
          <div className="footer-section footer-company">
            <div className="footer-logo">
              <img src="/design-excellence-logo.png" alt="Design Excellence Logo" className="footer-logo-img" />
            </div>
            <p className="footer-description">
              Premium office furniture for modern workplaces. We specialize in ergonomic solutions that enhance productivity and comfort for your business.
            </p>
            <div className="social-links">
              <a 
                href="https://www.facebook.com/designexcellence01/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="social-link" 
                aria-label="Facebook"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
            </div>
          </div>
          
          {/* Center Sections */}
          <div className="footer-section">
            <h4 className="footer-subtitle">Company</h4>
            <ul className="footer-links">
              <li><Link to="/about" className="footer-link">About Us</Link></li>
              <li><Link to="/products" className="footer-link">Our Products</Link></li>
              <li><Link to="/contact" className="footer-link">Contact Us</Link></li>
            </ul>
          </div>
          
          <div className="footer-section">
            <h4 className="footer-subtitle">Customer Services</h4>
            <ul className="footer-links">
              <li><Link to="/account" className="footer-link">My Account</Link></li>
              <li><Link to="/return-refund-policy" className="footer-link">Return & Refund Policy</Link></li>
            </ul>
          </div>
          
          {/* Right Section - Contact Info */}
          <div className="footer-section footer-contact">
            <h4 className="footer-subtitle">Contact Info</h4>
            <ul className="footer-contact-list">
              <li className="contact-item">
                <div className="contact-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                </div>
                <span className="contact-value">{contactData.phone}</span>
              </li>
              <li className="contact-item">
                <div className="contact-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <span className="contact-value">{contactData.email}</span>
              </li>
              <li className="contact-item">
                <div className="contact-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <span className="contact-value">{contactData.address}</span>
              </li>
            </ul>
          </div>
        </div>
        
        {/* Bottom Bar */}
        <div className="footer-bottom">
          <div className="footer-container">
            <div className="footer-bottom-content">
              {currentTheme === 'christmas' && (
                <div className="christmas-footer-decoration">
                  <ChristmasIcons.Sleigh size={16} />
                  <ChristmasIcons.Reindeer size={16} />
                </div>
              )}
              <p className="copyright">Copyright © 2024 DesignXcel. All Rights Reserved.</p>
              {currentTheme === 'christmas' && (
                <div className="christmas-footer-decoration">
                  <ChristmasIcons.Gift size={16} />
                  <ChristmasIcons.Bell size={16} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer; 