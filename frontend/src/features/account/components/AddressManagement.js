import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../../shared/services/api/apiClient';

const emptyForm = {
    label: '',
    houseNumber: '',
    street: '',
    barangay: '',
    city: '',
    province: '',
    region: '',
    postalCode: '',
    country: 'Philippines',
    isDefault: false
};

const AddressManagement = ({ returnTo }) => {
    const navigate = useNavigate();
    const [addresses, setAddresses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [defaultSettingId, setDefaultSettingId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    
    // Address autofill states
    const [regions, setRegions] = useState([]);
    const [provinces, setProvinces] = useState([]);
    const [, setCities] = useState([]);
    const [citySearchResults, setCitySearchResults] = useState([]);
    const [showCityDropdown, setShowCityDropdown] = useState(false);
    const [barangays, setBarangays] = useState([]);

    const fetchAddresses = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await apiClient.get('/api/customer/addresses');
            if (res.success && Array.isArray(res.addresses)) {
                setAddresses(res.addresses);
            } else {
                setAddresses([]);
            }
        } catch (e) {
            setError('Failed to load addresses.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { 
        fetchAddresses(); 
        fetchRegions();
    }, []);

    // Fetch Philippine regions
    const fetchRegions = async () => {
        try {
            const res = await apiClient.get('/api/address/regions');
            if (res.success) {
                setRegions(res.regions || []);
            }
        } catch (err) {
            console.warn('Failed to load regions');
        }
    };

    // Fetch provinces when region changes
    const fetchProvinces = async (regionCode) => {
        if (!regionCode) {
            setProvinces([]);
            return;
        }
        try {
            const res = await apiClient.get(`/api/address/provinces/${regionCode}`);
            if (res.success) {
                setProvinces(res.provinces || []);
            }
        } catch (err) {
            console.warn('Failed to load provinces');
        }
    };

    // Fetch cities when province changes
    const fetchCities = async (province) => {
        if (!province) {
            setCities([]);
            return;
        }
        try {
            const res = await apiClient.get(`/api/address/cities/${province}`);
            if (res.success) {
                setCities(res.cities || []);
            }
        } catch (err) {
            console.warn('Failed to load cities');
        }
    };

    // Search cities as user types
    const searchCity = async (query) => {
        if (!query || query.length < 2) {
            setCitySearchResults([]);
            setShowCityDropdown(false);
            return;
        }
        try {
            const res = await apiClient.get(`/api/address/search?q=${encodeURIComponent(query)}`);
            if (res.success) {
                setCitySearchResults(res.results || []);
                setShowCityDropdown(true);
            }
        } catch (err) {
            console.warn('Failed to search cities');
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setForm(emptyForm);
        setCitySearchResults([]);
        setShowCityDropdown(false);
    };

    const onChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        
        // Only trigger cascading for manual dropdown changes, not autofill
        if (field === 'region' && value) {
            fetchProvinces(value);
        }
        if (field === 'province' && value) {
            fetchCities(value);
        }
        if (field === 'city' && value) {
            searchCity(value);
        }
    };

    const selectCity = (result) => {
        // Set all fields at once to avoid cascading conflicts
        const newFormData = {
            ...form,
            city: result.city,
            province: result.province || form.province,
            region: result.region || form.region,
            postalCode: result.postalCode || form.postalCode,
            barangay: '' // Reset barangay when city changes
        };
        
        setForm(newFormData);
        setBarangays(result.barangays || []);
        setShowCityDropdown(false);
        setCitySearchResults([]);
        
        // Fetch provinces and cities for the autofilled region/province
        if (result.region) {
            fetchProvinces(result.region);
        }
        if (result.province) {
            fetchCities(result.province);
        }
    };

    const validate = () => {
        // Basic required fields
        const required = ['label', 'street', 'city', 'postalCode'];
        for (const key of required) {
            if (!String(form[key] || '').trim()) return false;
        }
        
        // Province is optional for NCR (Metro Manila) addresses
        const isNCR = form.region && (form.region.toUpperCase() === 'NCR' || form.region.includes('National Capital'));
        if (!isNCR && !String(form.province || '').trim()) {
            return false; // Province required for non-NCR addresses
        }
        
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) {
            setError('Please complete all required fields.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            if (editingId) {
                await apiClient.put(`/api/customer/addresses/${editingId}`, form);
            } else {
                await apiClient.post('/api/customer/addresses', form);
            }
            await fetchAddresses();
            resetForm();
            
            // If we came from checkout and this was a new address, navigate back
            if (returnTo === 'checkout' && !editingId) {
                // Show a brief success message before navigating
                setError(''); // Clear any existing errors
                setTimeout(() => {
                    navigate('/checkout');
                }, 500);
            }
        } catch (e) {
            setError('Failed to save address.');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (address) => {
        setEditingId(address.AddressID);
        setForm({
            label: address.Label || '',
            houseNumber: address.HouseNumber || '',
            street: address.Street || '',
            barangay: address.Barangay || '',
            city: address.City || '',
            province: address.Province || '',
            region: address.Region || '',
            postalCode: address.PostalCode || '',
            country: address.Country || 'Philippines',
            isDefault: !!address.IsDefault
        });
    };

    const handleDelete = async (addressId) => {
        setDeletingId(addressId);
        setError('');
        try {
            await apiClient.delete(`/api/customer/addresses/${addressId}`);
            await fetchAddresses();
            // Success notification (optional)
            setError(''); // Clear any previous errors
        } catch (e) {
            console.error('❌ Delete Address Error:', e);
            
            // Check if it's a 400 error with usedByOrders flag
            if (e.response?.status === 400 && e.response?.data?.usedByOrders) {
                setError(e.response.data.message || 'Cannot delete address because it is associated with existing orders.');
            } else if (e.response?.data?.message) {
                setError(e.response.data.message);
            } else {
                setError('Failed to delete address. Please try again.');
            }
        } finally {
            setDeletingId(null);
        }
    };

    const handleSetDefault = async (addressId) => {
        setDefaultSettingId(addressId);
        setError('');
        try {
            // Update existing address as default
            const address = addresses.find(a => a.AddressID === addressId);
            if (!address) return;
            await apiClient.put(`/api/customer/addresses/${addressId}`, {
                label: address.Label,
                houseNumber: address.HouseNumber,
                street: address.Street,
                barangay: address.Barangay,
                city: address.City,
                province: address.Province,
                region: address.Region,
                postalCode: address.PostalCode,
                country: address.Country || 'Philippines',
                isDefault: true
            });
            await fetchAddresses();
        } catch (e) {
            setError('Failed to set default address.');
        } finally {
            setDefaultSettingId(null);
        }
    };

    return (
        <div className="tab-container">
            <div className="tab-header">
                <div className="tab-header-content">
                    <div className="tab-header-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M8 9L12 13L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                    <div className="tab-header-text">
                        <h1 className="tab-title">Manage Addresses</h1>
                        <p className="tab-subtitle">
                            {returnTo === 'checkout' 
                                ? 'Add an address to continue with your checkout' 
                                : 'Add, edit, and manage your delivery addresses'
                            }
                        </p>
                    </div>
                    {returnTo === 'checkout' && (
                        <div className="tab-header-actions">
                            <button 
                                className="btn btn-secondary"
                                onClick={() => navigate('/checkout')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                Back to Checkout
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="error-alert" style={{ marginBottom: 12 }}>
                    {error}
                </div>
            )}

            {loading ? (
                <div style={{ 
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '60px 20px',
                    minHeight: '300px',
                    textAlign: 'center'
                }}>
                    <div style={{ 
                        fontSize: window.innerWidth < 768 ? '14px' : '16px', 
                        color: '#6b7280', 
                        marginTop: '16px',
                        fontWeight: '500',
                        maxWidth: '280px',
                        lineHeight: '1.5'
                    }}>
                        Loading addresses...
                    </div>
                </div>
            ) : (
                <div className="address-grid">
                    {addresses.length === 0 ? (
                        <div className="no-address-message">
                            You have no saved addresses. Add one below.
                        </div>
                    ) : (
                        addresses.map(addr => (
                            <div key={addr.AddressID} className="address-card">
                                <div className="address-card-header">
                                    <div>
                                        <span className="label-badge">{addr.Label || 'Address'}</span>
                                        {addr.IsDefault && <span className="default-badge" style={{ marginLeft: 8 }}>Default</span>}
                                    </div>
                                    <div className="address-card-actions">
                                        <button 
                                            className="btn-secondary-small"
                                            disabled={addr.IsDefault || defaultSettingId === addr.AddressID}
                                            onClick={() => handleSetDefault(addr.AddressID)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: window.innerWidth < 768 ? '4px' : '6px',
                                                padding: window.innerWidth < 768 ? '6px 10px' : '8px 12px',
                                                fontSize: window.innerWidth < 768 ? '12px' : '13px',
                                                minHeight: window.innerWidth < 768 ? '32px' : '36px'
                                            }}
                                        >
                                            {defaultSettingId === addr.AddressID ? 'Setting...' : 'Set Default'}
                                        </button>
                                        <button 
                                            className="btn-secondary-small"
                                            onClick={() => handleEdit(addr)}
                                        >
                                            Edit
                                        </button>
                                        <button 
                                            className={`btn-danger-small ${addr.IsDefault ? 'disabled-default' : ''}`}
                                            disabled={deletingId === addr.AddressID || addr.IsDefault}
                                            onClick={() => !addr.IsDefault && handleDelete(addr.AddressID)}
                                            title={addr.IsDefault ? 'Cannot delete default address. Set another address as default first.' : 'Delete address'}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: window.innerWidth < 768 ? '4px' : '6px',
                                                padding: window.innerWidth < 768 ? '6px 10px' : '8px 12px',
                                                fontSize: window.innerWidth < 768 ? '12px' : '13px',
                                                minHeight: window.innerWidth < 768 ? '32px' : '36px'
                                            }}
                                        >
                                            {deletingId === addr.AddressID ? 'Deleting...' : 'Delete'}
                                        </button>
                                    </div>
                                </div>
                                <div className="address-card-body">
                                    <div className="address-name">
                                        {[addr.FirstName, addr.LastName].filter(Boolean).join(' ') || ''}
                                    </div>
                                    <div className="address-full">
                                        {[addr.HouseNumber, addr.Street, addr.Barangay, addr.City, addr.Province, addr.Region, addr.PostalCode, addr.Country || 'Philippines']
                                            .filter(Boolean).join(', ')}
                                    </div>
                                    {addr.PhoneNumber && (
                                        <div className="address-phone">{addr.PhoneNumber}</div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            <div className="address-form" style={{ marginTop: 24 }}>
                <h3 style={{ marginBottom: 8 }}>{editingId ? 'Edit Address' : 'Add New Address'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-field">
                            <label>Label*</label>
                            <input value={form.label} onChange={e => onChange('label', e.target.value)} placeholder="Home, Office" />
                        </div>
                        <div className="form-field">
                            <label>House Number</label>
                            <input value={form.houseNumber} onChange={e => onChange('houseNumber', e.target.value)} />
                        </div>
                        <div className="form-field">
                            <label>Street*</label>
                            <input value={form.street} onChange={e => onChange('street', e.target.value)} />
                        </div>
                        <div className="form-field">
                            <label>Barangay {barangays.length > 0 && <span style={{ fontSize: '12px', color: '#16a34a' }}>(Select from list)</span>}</label>
                            {barangays.length > 0 ? (
                                <select 
                                    value={form.barangay} 
                                    onChange={e => onChange('barangay', e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '4px',
                                        fontSize: '14px'
                                    }}
                                >
                                    <option value="">Select Barangay</option>
                                    {barangays.map((brgy, idx) => (
                                        <option key={idx} value={brgy}>{brgy}</option>
                                    ))}
                                </select>
                            ) : (
                                <input value={form.barangay} onChange={e => onChange('barangay', e.target.value)} placeholder="Enter barangay" />
                            )}
                        </div>
                        <div className="form-field" style={{ position: 'relative' }}>
                            <label>City* <span style={{ fontSize: '12px', color: '#6b7280' }}>(Start typing to search)</span></label>
                            <input 
                                value={form.city} 
                                onChange={e => onChange('city', e.target.value)}
                                onBlur={() => setTimeout(() => setShowCityDropdown(false), 200)}
                                placeholder="Type city name..."
                                autoComplete="off"
                            />
                            {showCityDropdown && citySearchResults.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    backgroundColor: 'white',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '4px',
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    zIndex: 1000,
                                    marginTop: '4px'
                                }}>
                                    {citySearchResults.map((result, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => selectCity(result)}
                                            style={{
                                                padding: '10px 12px',
                                                cursor: 'pointer',
                                                borderBottom: idx < citySearchResults.length - 1 ? '1px solid #f3f4f6' : 'none',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={e => e.target.style.backgroundColor = '#f9fafb'}
                                            onMouseLeave={e => e.target.style.backgroundColor = 'white'}
                                        >
                                            <div style={{ fontWeight: '500', color: '#111827' }}>{result.city}</div>
                                            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                                {result.province ? `${result.province}, ${result.region}` : result.region}
                                                {result.postalCode && <span style={{ marginLeft: '8px', color: '#16a34a' }}>• {result.postalCode}</span>}
                                            </div>
                                            {result.barangays && result.barangays.length > 0 && (
                                                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                                                    {result.barangays.length} barangays available
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="form-field">
                            <label>
                                Province
                                {form.region && (form.region.toUpperCase() === 'NCR' || form.region.includes('National Capital')) ? (
                                    <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'normal' }}> (Optional for NCR)</span>
                                ) : (
                                    <span style={{ color: 'red' }}>*</span>
                                )}
                            </label>
                            <select 
                                value={form.province} 
                                onChange={e => onChange('province', e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '4px',
                                    fontSize: '14px'
                                }}
                            >
                                <option value="">Select Province</option>
                                {provinces.map((prov, idx) => (
                                    <option key={idx} value={prov}>{prov}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-field">
                            <label>Region</label>
                            <select 
                                value={form.region} 
                                onChange={e => onChange('region', e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '4px',
                                    fontSize: '14px'
                                }}
                            >
                                <option value="">Select Region</option>
                                {regions.map((reg, idx) => (
                                    <option key={idx} value={reg.short}>{reg.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-field">
                            <label>Postal Code*</label>
                            <input value={form.postalCode} onChange={e => onChange('postalCode', e.target.value)} />
                        </div>
                        <div className="form-field">
                            <label>Country</label>
                            <input value={form.country} onChange={e => onChange('country', e.target.value)} />
                        </div>
                        <div className="form-field checkbox">
                            <label>
                                <input type="checkbox" checked={form.isDefault} onChange={e => onChange('isDefault', e.target.checked)} />
                                <span style={{ marginLeft: 6 }}>Set as default</span>
                            </label>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button 
                            className="btn-primary" 
                            type="submit" 
                            disabled={saving}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: window.innerWidth < 768 ? '6px' : '8px',
                                padding: window.innerWidth < 768 ? '12px 16px' : '12px 20px',
                                fontSize: window.innerWidth < 768 ? '14px' : '16px',
                                minHeight: window.innerWidth < 768 ? '44px' : '48px',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {saving ? (editingId ? 'Saving...' : 'Adding...') : (editingId ? 'Save Changes' : 'Add Address')}
                        </button>
                        {editingId && (
                            <button type="button" className="btn-secondary" onClick={resetForm}>
                                Cancel
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddressManagement;


