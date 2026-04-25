import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminService } from '../services/adminService';
import Modal from '../../../shared/components/ui/Modal';
import PageHeader from '../../../shared/components/layout/PageHeader';
import './AdminBulkOrdersPage.css';

const AdminBulkOrdersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [bulkOrders, setBulkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    currentPage: 1
  });

  useEffect(() => {
    fetchBulkOrders();
  }, [statusFilter, pagination.offset]);

  const fetchBulkOrders = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await adminService.getBulkOrders({
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: pagination.limit,
        offset: pagination.offset
      });

      if (response.success) {
        setBulkOrders(response.bulkOrders || []);
        setPagination(prev => ({
          ...prev,
          total: response.total || 0
        }));
      }
    } catch (err) {
      console.error('Error fetching bulk orders:', err);
      setError('Failed to load bulk orders');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusFilter = (status) => {
    setStatusFilter(status);
    setPagination(prev => ({
      ...prev,
      offset: 0,
      currentPage: 1
    }));
    setSearchParams(status === 'all' ? {} : { status });
  };

  const handlePageChange = (page) => {
    const offset = (page - 1) * pagination.limit;
    setPagination(prev => ({
      ...prev,
      offset,
      currentPage: page
    }));
  };

  const handleViewDetails = async (orderId) => {
    try {
      const response = await adminService.getBulkOrderDetails(orderId);
      if (response.success) {
        setSelectedOrder(response);
        setShowDetailsModal(true);
      }
    } catch (err) {
      console.error('Error fetching order details:', err);
      alert('Failed to load order details');
    }
  };

  const handleUpdateStatus = (order) => {
    setSelectedOrder({ order: order });
    setNewStatus(order.Status);
    setStatusNotes(order.Notes || '');
    setShowStatusModal(true);
  };

  const handleSaveStatus = async () => {
    if (!selectedOrder?.order || !newStatus) return;

    try {
      setUpdatingStatus(true);
      await adminService.updateBulkOrderStatus(
        selectedOrder.order.BulkOrderID,
        newStatus,
        statusNotes
      );
      setShowStatusModal(false);
      fetchBulkOrders();
      alert('Status updated successfully');
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Failed to update status');
    } finally {
      setUpdatingStatus(false);
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

  const totalPages = Math.ceil(pagination.total / pagination.limit);

  return (
    <div className="admin-bulk-orders-page">
      <PageHeader 
        title="Bulk Orders Management" 
        subtitle="Manage and track bulk orders from customers"
      />

      <div className="admin-bulk-orders-container">
        {/* Filters */}
        <div className="filters-section">
          <div className="status-filters">
            <button
              className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('all')}
            >
              All
            </button>
            <button
              className={`filter-btn ${statusFilter === 'Pending' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('Pending')}
            >
              Pending
            </button>
            <button
              className={`filter-btn ${statusFilter === 'Processing' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('Processing')}
            >
              Processing
            </button>
            <button
              className={`filter-btn ${statusFilter === 'Completed' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('Completed')}
            >
              Completed
            </button>
            <button
              className={`filter-btn ${statusFilter === 'Cancelled' ? 'active' : ''}`}
              onClick={() => handleStatusFilter('Cancelled')}
            >
              Cancelled
            </button>
          </div>
        </div>

        {/* Orders Table */}
        {loading ? (
          <div className="loading-state">Loading bulk orders...</div>
        ) : error ? (
          <div className="error-state">{error}</div>
        ) : bulkOrders.length === 0 ? (
          <div className="empty-state">
            <p>No bulk orders found</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="bulk-orders-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Email</th>
                    <th>Quantity</th>
                    <th>Subtotal</th>
                    <th>Discount</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkOrders.map((order) => (
                    <tr key={order.BulkOrderID}>
                      <td>
                        {order.CustomerName || 'Guest'}
                      </td>
                      <td>{order.CustomerEmail || 'N/A'}</td>
                      <td>{order.TotalQuantity}</td>
                      <td>{formatCurrency(order.Subtotal)}</td>
                      <td>{formatCurrency(order.DiscountAmount || 0)}</td>
                      <td><strong>{formatCurrency(order.GrandTotal)}</strong></td>
                      <td>
                        <span className={`status-badge ${getStatusColor(order.Status)}`}>
                          {order.Status}
                        </span>
                      </td>
                      <td>{formatDate(order.CreatedAt)}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn-view"
                            onClick={() => handleViewDetails(order.BulkOrderID)}
                          >
                            View
                          </button>
                          <button
                            className="btn-update"
                            onClick={() => handleUpdateStatus(order)}
                          >
                            Update Status
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  disabled={pagination.currentPage === 1}
                  onClick={() => handlePageChange(pagination.currentPage - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {pagination.currentPage} of {totalPages}
                </span>
                <button
                  disabled={pagination.currentPage === totalPages}
                  onClick={() => handlePageChange(pagination.currentPage + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Order Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title="Bulk Order Details"
      >
        {selectedOrder && (
          <div className="order-details-modal">
            <div className="details-section">
              <h3>Order Information</h3>
              <div className="detail-row">
                <span>Customer:</span>
                <span>{selectedOrder.order?.CustomerName || selectedOrder.order?.CustomerEmail || 'Guest'}</span>
              </div>
              <div className="detail-row">
                <span>Email:</span>
                <span>{selectedOrder.order?.CustomerEmail || 'N/A'}</span>
              </div>
              <div className="detail-row">
                <span>Status:</span>
                <span className={`status-badge ${getStatusColor(selectedOrder.order?.Status)}`}>
                  {selectedOrder.order?.Status}
                </span>
              </div>
              <div className="detail-row">
                <span>Created:</span>
                <span>{formatDate(selectedOrder.order?.CreatedAt)}</span>
              </div>
            </div>

            <div className="details-section">
              <h3>Order Items</h3>
              <div className="items-table">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Quantity</th>
                      <th>Unit Price</th>
                      <th>Discount</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items?.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.ProductName}</td>
                        <td>{item.SKU || 'N/A'}</td>
                        <td>{item.Quantity}</td>
                        <td>{formatCurrency(item.UnitPrice)}</td>
                        <td>{item.DiscountPercent || 0}%</td>
                        <td>{formatCurrency(item.ItemTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="details-section">
              <h3>Order Summary</h3>
              <div className="detail-row">
                <span>Total Quantity:</span>
                <span>{selectedOrder.order?.TotalQuantity}</span>
              </div>
              <div className="detail-row">
                <span>Subtotal:</span>
                <span>{formatCurrency(selectedOrder.order?.Subtotal)}</span>
              </div>
              <div className="detail-row">
                <span>Discount:</span>
                <span>{formatCurrency(selectedOrder.order?.DiscountAmount || 0)}</span>
              </div>
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

      {/* Status Update Modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="Update Order Status"
      >
        <div className="status-update-modal">
          <div className="form-group">
            <label>Status *</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="form-control"
            >
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              className="form-control"
              rows="4"
              placeholder="Add any notes about this status change..."
            />
          </div>

          <div className="modal-actions">
            <button
              className="btn-cancel"
              onClick={() => setShowStatusModal(false)}
            >
              Cancel
            </button>
            <button
              className="btn-save"
              onClick={handleSaveStatus}
              disabled={updatingStatus || !newStatus}
            >
              {updatingStatus ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminBulkOrdersPage;

