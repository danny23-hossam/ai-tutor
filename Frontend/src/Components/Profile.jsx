import React, { useState, useEffect } from 'react';
import Header from './Header';
import apiClient from '../api/apiClient';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import './Profile.css';

const Profile = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [formData, setFormData] = useState({ full_name: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await apiClient.get('/users/profile');
        setEmail(res.data.email || '');
        setFormData(prev => ({
          ...prev,
          full_name: res.data.full_name || '',
        }));
      } catch (err) {
        console.error('Failed to load profile:', err);
        toast.error('Could not load profile.');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const validate = () => {
    const newErrors = {};
    if (!formData.full_name.trim()) newErrors.full_name = 'Name is required';
    if (formData.password && formData.password.length < 6)
      newErrors.password = 'Password must be at least 6 characters';
    if (formData.password && formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { full_name: formData.full_name };
      if (formData.password) payload.password = formData.password;
      const res = await apiClient.put('/users/profile', payload);
      const currentUser = JSON.parse(localStorage.getItem('user')) || {};
      localStorage.setItem('user', JSON.stringify({ ...currentUser, ...res.data }));
      toast.success('Profile updated!');
      setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
    } catch (err) {
      const msg = err.response?.data?.message || 'Could not update profile.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <><Header /><div className="p-5 pf-text-muted">Loading profile...</div></>;

  return (
    <>
      <Header />
      <main className="container pf-container">

        <h2 className="pf-heading">My Profile</h2>
        <p className="pf-subheading">Manage your account details</p>

        <form onSubmit={handleSave} className="pf-form">

          {/* ── Account Info ─────────────────── */}
          <div className="pf-group">
            <div>
              <label htmlFor="profile-name" className="pf-label">Full Name</label>
              <input
                id="profile-name"
                className="pf-input"
                type="text"
                autoComplete="name"
                value={formData.full_name}
                onChange={e => setFormData({ ...formData, full_name: e.target.value })}
              />
              {errors.full_name && <p className="pf-error" role="alert">{errors.full_name}</p>}
            </div>

            <div>
              <label htmlFor="profile-email" className="pf-label">Email</label>
              <input
                id="profile-email"
                className="pf-input"
                type="email"
                value={email}
                disabled
                readOnly
              />
            </div>

          </div>

          {/* ── Change Password ───────────────── */}
          <div className="pf-password-section">
            <div>
              <p className="pf-password-title">Change Password</p>
              <p className="pf-password-hint">Leave blank to keep current password</p>
            </div>

            <div>
              <label htmlFor="profile-password" className="pf-label">New Password</label>
              <input
                id="profile-password"
                className="pf-input"
                type="password"
                placeholder="New password (optional)"
                autoComplete="new-password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
              />
              {errors.password && <p className="pf-error" role="alert">{errors.password}</p>}
            </div>

            <div>
              <label htmlFor="profile-confirm-password" className="pf-label">Confirm New Password</label>
              <input
                id="profile-confirm-password"
                className="pf-input"
                type="password"
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={formData.confirmPassword}
                onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
              />
              {errors.confirmPassword && <p className="pf-error" role="alert">{errors.confirmPassword}</p>}
            </div>
          </div>

          {/* ── Actions ─────────────────────── */}
          <div className="pf-actions">
            <button type="submit" className="pf-btn-save" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" className="pf-btn-cancel" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>

        </form>
      </main>
    </>
  );
};

export default Profile;
