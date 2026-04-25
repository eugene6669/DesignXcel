import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { customerService } from '../services/customerService';
import { useAuth } from '../../../shared/hooks/useAuth';
import Modal from '../../../shared/components/ui/Modal';
import PageHeader from '../../../shared/components/layout/PageHeader';
import './BulkOrderHistoryPage.css';

const BulkOrderHistoryPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [bulkOrders, setBulkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { 
        state: { from: '/bulk-orders/history', message: 'Please log in to view your bulk order history' }
      });
    } else if (isAuthenticated) {
      fetchBulkOrders();
    }
  }, [authLoading, isAuthenticated, navigate]);

  const fetchBulkOrders = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await customerService.getBulkOrders();
      if (response.success) {
        setBulkOrders(response.bulkOrders || []);
      }
    } catch (err) {
      console.error('Error fetching bulk orders:', err);
      setError('Failed to load bulk orders');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (orderId) => {
    try {
      const response = await customerService.getBulkOrderDetails(orderId);
      if (response.success) {
        setSelectedOrder(response);
        setShowDetailsModal(true);
      }
    } catch (err) {
      console.error('Error fetching order details:', err);
      alert('Failed to load order details');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      'Pending': 'status-pending',
      'Processing': 'status-processing',
      'Completed': 'status-completed',
      'Cancelled': 'status-cancelled'
    };
    return colors[status] || 'status-pending';
  };

  const getStatusIcon = (status) => {
    const icons = {
      'Pending': '⏳',
      'Processing': '🔄',
      'Completed': '✅',
      'Cancelled': '❌'
    };
    return icons[status] || '⏳';
  };

  if (authLoading) {
    return <div className="loading-state">Loading...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="bulk-order-history-page">
      <PageHeader 
        title="My Bulk Orders" 
        subtitle="View and track your bulk order history"
      />

      <div className="bulk-order-history-container">
        {loading ? (
          <div className="loading-state">Loading your bulk orders...</div>
        ) : error ? (
          <div className="error-state">{error}</div>
        ) : bulkOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No Bulk Orders Yet</h3>
            <p>You haven't placed any bulk orders yet. Start by creating a bulk order!</p>
            <button 
              className="btn-primary"
              onClick={() => navigate('/bulk-order')}
            >
              Create Bulk Order
            </button>
          </div>
        ) : (
          <div className="orders-grid">
            {bulkOrders.map((order) => (
              <div key={order.BulkOrderID} className="order-card">
                <div className="order-card-header">
                  <div className="order-id">
                    <span className="order-number">#{order.BulkOrderID}</span>
                    <span className="order-date">{formatDate(order.CreatedAt)}</span>
                  </div>
                  <span className={`status-badge ${getStatusColor(order.Status)}`}>
                    {getStatusIcon(order.Status)} {order.Status}
                  </span>
                </div>

                <div className="order-card-body">
                  <div className="order-info-row">
                    <span>Total Quantity:</span>
                    <span><strong>{order.TotalQuantity} items</strong></span>
                  </div>
                  <div className="order-info-row">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(order.Subtotal)}</span>
                  </div>
                  {order.DiscountAmount > 0 && (
                    <div className="order-info-row discount">
                      <span>Discount:</span>
                      <span>-{formatCurrency(order.DiscountAmount)}</span>
                    </div>
                  )}
                  <div className="order-info-row total">
                    <span>Total:</span>
                    <span><strong>{formatCurrency(order.GrandTotal)}</strong></span>
                  </div>
                </div>

                <div className="order-card-footer">
                  <button
                    className="btn-view-details"
                    onClick={() => handleViewDetails(order.BulkOrderID)}
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title={`Bulk Order #${selectedOrder?.order?.BulkOrderID || ''}`}
      >
        {selectedOrder && (
          <div className="order-details-modal">
            <div className="details-section">
              <h3>Order Information</h3>
              <div className="detail-row">
                <span>Order ID:</span>
                <span>#{selectedOrder.order?.BulkOrderID}</span>
              </div>
              <div className="detail-row">
                <span>Status:</span>
                <span className={`status-badge ${getStatusColor(selectedOrder.order?.Status)}`}>
                  {getStatusIcon(selectedOrder.order?.Status)} {selectedOrder.order?.Status}
                </span>
              </div>
              <div className="detail-row">
                <span>Order Date:</span>
                <span>{formatDate(selectedOrder.order?.CreatedAt)}</span>
              </div>
              {selectedOrder.order?.UpdatedAt && (
                <div className="detail-row">
                  <span>Last Updated:</span>
                  <span>{formatDate(selectedOrder.order.UpdatedAt)}</span>
                </div>
              )}
            </div>

            <div className="details-section">
              <h3>Order Items</h3>
              <div className="items-list">
                {selectedOrder.items?.map((item, idx) => (
                  <div key={idx} className="order-item">
                    {item.ProductImage && (
                      <img 
                        src={item.ProductImage} 
                        alt={item.ProductName}
                        className="item-image"
                      />
                    )}
                    <div className="item-details">
                      <h4>{item.ProductName}</h4>
                      <p className="item-sku">SKU: {item.SKU || 'N/A'}</p>
                      <div className="item-info">
                        <span>Qty: {item.Quantity}</span>
                        <span>Unit Price: {formatCurrency(item.UnitPrice)}</span>
                        {item.DiscountPercent > 0 && (
                          <span className="discount">Discount: {item.DiscountPercent}%</span>
                        )}
                        <span className="item-total">Total: {formatCurrency(item.ItemTotal)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="details-section">
              <h3>Order Summary</h3>
              <div className="detail-row">
                <span>Total Quantity:</span>
                <span>{selectedOrder.order?.TotalQuantity} items</span>
              </div>
              <div className="detail-row">
                <span>Subtotal:</span>
                <span>{formatCurrency(selectedOrder.order?.Subtotal)}</span>
              </div>
              {selectedOrder.order?.DiscountAmount > 0 && (
                <div className="detail-row discount">
                  <span>Discount:</span>
                  <span>-{formatCurrency(selectedOrder.order.DiscountAmount)}</span>
                </div>
              )}
              <div className="detail-row total-row">
                <span>Grand Total:</span>
                <span><strong>{formatCurrency(selectedOrder.order?.GrandTotal)}</strong></span>
              </div>
            </div>

            {selectedOrder.order?.Notes && (
              <div className="details-section">
                <h3>Notes</h3>
                <p>{selectedOrder.order.Notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BulkOrderHistoryPage;

