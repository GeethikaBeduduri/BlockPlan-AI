import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Building2, UserCheck, KeyRound, ArrowRight, AlertCircle, CheckCircle2, RefreshCw, UserPlus, Lock, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Role, DepartmentType } from '../data/mockComplaints';
import trainHero from '../assets/train-hero.jpg';

export default function LoginPage() {
  const { authenticate, registerAccount, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<'role-select' | 'login-form' | 'sign-up' | 'forgot-password'>('role-select');
  const [selectedRole, setSelectedRole] = useState<Role>('STATION_MASTER');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [selectedDept, setSelectedDept] = useState<DepartmentType>('Engineering');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // SIGN UP FORM STATES
  const [signUpFullName, setSignUpFullName] = useState('');
  const [signUpEmployeeId, setSignUpEmployeeId] = useState('');
  const [signUpStation, setSignUpStation] = useState('Guntur Railway Station');
  const [signUpDept, setSignUpDept] = useState<DepartmentType>('Engineering');
  const [signUpDesignation, setSignUpDesignation] = useState('Sr. Operations Executive');
  const [signUpContact, setSignUpContact] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState('');
  const [signUpError, setSignUpError] = useState('');

  // FORGOT PASSWORD FLOW STATES
  const [fpStep, setFpStep] = useState<'verify-id' | 'verify-code' | 'new-password' | 'success'>('verify-id');
  const [fpId, setFpId] = useState('');
  const [fpContact, setFpContact] = useState('');
  const [fpCode, setFpCode] = useState('');
  const [fpNewPass, setFpNewPass] = useState('');
  const [fpConfirmPass, setFpConfirmPass] = useState('');
  const [fpError, setFpError] = useState('');

  const handleRoleCardClick = (role: Role) => {
    setSelectedRole(role);
    setErrorMessage('');
    setSuccessMessage('');
    setEmployeeId('');
    setPassword('');
    setStep('login-form');
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const result = authenticate(selectedRole, employeeId, password, selectedDept);

    if (result.success) {
      if (selectedRole === 'ADMIN') {
        navigate('/complaints/admin', { replace: true });
      } else if (selectedRole === 'DEPARTMENT') {
        navigate('/complaints/department', { replace: true });
      } else {
        navigate('/complaints/station-master', { replace: true });
      }
    } else {
      setErrorMessage(result.error || 'Invalid ID or password.');
    }
  };

  const handleSignUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSignUpError('');

    if (!signUpFullName.trim() || !signUpEmployeeId.trim() || !signUpContact.trim() || !signUpPassword.trim()) {
      setSignUpError('Please fill out all required fields.');
      return;
    }

    if (signUpPassword !== signUpConfirmPassword) {
      setSignUpError('Passwords do not match.');
      return;
    }

    const res = registerAccount({
      role: selectedRole,
      employeeId: signUpEmployeeId,
      fullName: signUpFullName,
      contact: signUpContact,
      password: signUpPassword,
      station: selectedRole === 'STATION_MASTER' ? signUpStation : undefined,
      department: selectedRole === 'DEPARTMENT' ? signUpDept : undefined,
      designation: selectedRole === 'ADMIN' ? signUpDesignation : undefined,
    });

    if (res.success) {
      setEmployeeId(signUpEmployeeId);
      setPassword('');
      setSuccessMessage(
        selectedRole === 'ADMIN'
          ? 'Admin account created successfully. Please sign in.'
          : 'Account created successfully. Please sign in.'
      );
      setStep('login-form');
    } else {
      setSignUpError(res.error || 'Failed to create account.');
    }
  };

  // FORGOT PASSWORD HANDLERS
  const handleFpVerifyId = (e: React.FormEvent) => {
    e.preventDefault();
    setFpError('');
    if (!fpId.trim() || !fpContact.trim()) {
      setFpError(`Please enter both ${selectedRole === 'ADMIN' ? 'Admin ID' : 'Employee ID'} and Registered Contact.`);
      return;
    }
    setFpStep('verify-code');
  };

  const handleFpVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    setFpError('');
    if (!fpCode.trim()) {
      setFpError('Please enter the verification code.');
      return;
    }
    setFpStep('new-password');
  };

  const handleFpResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setFpError('');
    if (!fpNewPass.trim() || !fpConfirmPass.trim()) {
      setFpError('Please fill out both password fields.');
      return;
    }
    if (fpNewPass.trim() !== fpConfirmPass.trim()) {
      setFpError('Passwords do not match.');
      return;
    }

    const res = resetPassword(fpId, fpNewPass);
    if (res.success) {
      setFpStep('success');
    } else {
      setFpError(res.message);
    }
  };

  // Role accent colors
  const roleAccent = selectedRole === 'ADMIN' ? '#a855f7' : selectedRole === 'DEPARTMENT' ? '#22d3ee' : '#f59e0b';
  const roleLabel = selectedRole === 'ADMIN' ? 'Admin' : selectedRole === 'DEPARTMENT' ? 'Department' : 'Station Master';

  // Common input class
  const inputClass = "w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-orange-500/60 focus:bg-white/[0.06] placeholder-white/25 font-medium transition-all duration-200";
  const labelClass = "text-[11px] font-bold text-white/40 uppercase tracking-widest";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: '#060608' }}>

      {/* ===== LEFT PANEL — Train Hero Image ===== */}
      <div className="relative lg:w-[48%] w-full h-[220px] sm:h-[280px] lg:h-auto lg:min-h-screen overflow-hidden flex-shrink-0">
        {/* Image */}
        <img
          src={trainHero}
          alt="Indian Railways"
          className="absolute inset-0 w-full h-full object-cover animate-ken-burns"
        />

        {/* Dark overlay gradient */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.6) 100%)'
        }} />

        {/* Bottom gradient fade (blends into right panel on mobile) */}
        <div className="absolute bottom-0 left-0 right-0 h-32 lg:hidden" style={{
          background: 'linear-gradient(to top, #060608, transparent)'
        }} />

        {/* Right edge gradient (blends into right panel on desktop) */}
        <div className="hidden lg:block absolute top-0 right-0 bottom-0 w-32" style={{
          background: 'linear-gradient(to left, #060608, transparent)'
        }} />

        {/* Brand overlay text */}
        <div className="absolute bottom-8 left-8 right-8 lg:bottom-12 lg:left-12 z-10 animate-slide-in-left">
          <div className="flex items-center gap-2 mb-4">
            
           
          </div>
          <h1 className="text-white font-black text-3xl sm:text-4xl lg:text-7xl leading-tight tracking-tight hidden lg:block">
            Block<br />Planning<br />
            <span style={{ color: '#f97316' }}>Portal</span>
          </h1>
          <p className="text-white/40 text-sm mt-3 max-w-xs hidden lg:block leading-relaxed">
            AI-powered maintenance scheduling & defect tracking for Indian Railways infrastructure.
          </p>
        </div>
      </div>

      {/* ===== RIGHT PANEL — Forms ===== */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 sm:px-8 lg:px-12 py-8 lg:py-12 overflow-y-auto relative">

        {/* Subtle background glow */}
        <div className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full blur-[100px] pointer-events-none" style={{ background: 'rgba(249,115,22,0.04)' }} />

        <div className="w-full max-w-md z-10 space-y-6">

          {/* ============== STEP 1: ROLE SELECTION ============== */}
          {step === 'role-select' && (
            <div className="animate-fade-slide-up space-y-6">
              <div>
                <h2 className="text-white font-extrabold text-2xl sm:text-3xl tracking-tight">
                  Select Your <span style={{ color: '#f97316' }}>Role</span>
                </h2>
                <p className="text-white/30 text-sm mt-2">Choose your operational role to access the portal.</p>
              </div>

              <div className="space-y-3">
                {/* Station Master Card */}
                <div
                  onClick={() => handleRoleCardClick('STATION_MASTER')}
                  className="group cursor-pointer rounded-2xl p-5 flex items-center gap-4 transition-all duration-300 hover:translate-x-1"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(245,158,11,0.4)';
                    e.currentTarget.style.background = 'rgba(245,158,11,0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)' }}>
                    <UserCheck className="w-6 h-6 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold text-base">Station Master</h3>
                    <p className="text-white/30 text-xs mt-0.5 leading-relaxed">Report defects, track complaints, respond to clarifications</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-white/15 group-hover:text-amber-400 transition-colors flex-shrink-0" />
                </div>

                {/* Department Card */}
                <div
                  onClick={() => handleRoleCardClick('DEPARTMENT')}
                  className="group cursor-pointer rounded-2xl p-5 flex items-center gap-4 transition-all duration-300 hover:translate-x-1"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(34,211,238,0.4)';
                    e.currentTarget.style.background = 'rgba(34,211,238,0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.25)' }}>
                    <Building2 className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold text-base">Department</h3>
                    <p className="text-white/30 text-xs mt-0.5 leading-relaxed">Technical assessments, complaint review, task creation</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-white/15 group-hover:text-cyan-400 transition-colors flex-shrink-0" />
                </div>

                {/* Admin Card */}
                <div
                  onClick={() => handleRoleCardClick('ADMIN')}
                  className="group cursor-pointer rounded-2xl p-5 flex items-center gap-4 transition-all duration-300 hover:translate-x-1"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)';
                    e.currentTarget.style.background = 'rgba(168,85,247,0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.25)' }}>
                    <ShieldCheck className="w-6 h-6 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold text-base">Administrator</h3>
                    <p className="text-white/30 text-xs mt-0.5 leading-relaxed">System monitoring, role governance, audit administration</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-white/15 group-hover:text-purple-400 transition-colors flex-shrink-0" />
                </div>
              </div>

              {/* Footer */}
              <p className="text-white/15 text-[11px] text-center pt-2">
                AI-Powered Block Planning • South Central Railway
              </p>
            </div>
          )}

          {/* ============== STEP 2: LOGIN FORM ============== */}
          {step === 'login-form' && (
            <div className="animate-fade-slide-up space-y-5">
              {/* Back button */}
              <button
                onClick={() => setStep('role-select')}
                className="flex items-center gap-2 text-white/30 hover:text-white text-xs font-medium transition-colors cursor-pointer group"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                Back to Roles
              </button>

              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${roleAccent}20`, border: `1px solid ${roleAccent}40` }}>
                  <KeyRound className="w-5 h-5" style={{ color: roleAccent }} />
                </div>
                <div>
                  <h2 className="text-white font-extrabold text-xl tracking-tight">{roleLabel} Login</h2>
                  <p className="text-white/25 text-xs">Authentication Required</p>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px w-full" style={{ background: 'rgba(255,255,255,0.06)' }} />

              {/* Success Message */}
              {successMessage && (
                <div className="rounded-xl p-3.5 text-xs flex items-center gap-2.5" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }}>
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="font-bold">{successMessage}</span>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className="rounded-xl p-3.5 text-xs flex items-center gap-2.5 animate-shake" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="font-semibold">{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4" autoComplete="off">
                {/* ID Input */}
                <div className="space-y-2">
                  <label className={labelClass}>
                    {selectedRole === 'ADMIN' ? 'Admin ID' : 'Employee ID'}
                  </label>
                  <input
                    type="text"
                    name="railway_user_id"
                    id="railway_user_id"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder={selectedRole === 'ADMIN' ? 'Enter Admin ID' : 'Enter Employee ID'}
                    autoComplete="off"
                    required
                    className={inputClass}
                  />
                </div>

                {/* Department Selection (Only for Department Role) */}
                {selectedRole === 'DEPARTMENT' && (
                  <div className="space-y-2">
                    <label className={labelClass}>Department Wing</label>
                    <select
                      value={selectedDept}
                      onChange={(e) => setSelectedDept(e.target.value as DepartmentType)}
                      className={inputClass}
                    >
                      <option value="Engineering">Engineering (Track Defects)</option>
                      <option value="Traction">Traction (OHE &amp; Substation Defects)</option>
                      <option value="Signal &amp; Telecom">Signal &amp; Telecom (Signal/Telecom Faults)</option>
                      <option value="Electrical">Electrical (Equipment Failures)</option>
                    </select>
                  </div>
                )}

                {/* Password Input */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className={labelClass}>Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setFpStep('verify-id');
                        setFpError('');
                        setFpId(employeeId || '');
                        setFpContact('');
                        setFpCode('');
                        setFpNewPass('');
                        setFpConfirmPass('');
                        setStep('forgot-password');
                      }}
                      className="text-[11px] font-semibold hover:underline transition-colors cursor-pointer"
                      style={{ color: roleAccent }}
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <input
                    type="password"
                    name="railway_user_pass"
                    id="railway_user_pass"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter Password"
                    autoComplete="new-password"
                    required
                    className={inputClass}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-200 cursor-pointer mt-2"
                  style={{
                    background: `linear-gradient(135deg, ${roleAccent}, ${roleAccent}cc)`,
                    boxShadow: `0 4px 20px ${roleAccent}30`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 6px 28px ${roleAccent}50`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = `0 4px 20px ${roleAccent}30`; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {/* Sign Up link (hidden for Admin role) */}
                {selectedRole !== 'ADMIN' && (
                  <div className="text-center pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSignUpError('');
                        setSignUpFullName('');
                        setSignUpEmployeeId('');
                        setSignUpContact('');
                        setSignUpPassword('');
                        setSignUpConfirmPassword('');
                        setSignUpDesignation('Sr. Operations Executive');
                        setStep('sign-up');
                      }}
                      className="text-xs text-white/30 hover:text-white transition-colors cursor-pointer"
                    >
                      Don't have an account? <span className="font-bold hover:underline" style={{ color: roleAccent }}>Sign Up</span>
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* ============== STEP 3: SIGN UP FORM ============== */}
          {step === 'sign-up' && (
            <div className="animate-fade-slide-up space-y-5">
              {/* Back button */}
              <button
                onClick={() => setStep('login-form')}
                className="flex items-center gap-2 text-white/30 hover:text-white text-xs font-medium transition-colors cursor-pointer group"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                Back to Sign In
              </button>

              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${roleAccent}20`, border: `1px solid ${roleAccent}40` }}>
                    <UserPlus className="w-5 h-5" style={{ color: roleAccent }} />
                  </div>
                  <div>
                    <h2 className="text-white font-extrabold text-lg tracking-tight uppercase">
                      {selectedRole === 'ADMIN' ? 'Create Admin Account'
                        : selectedRole === 'DEPARTMENT' ? 'Create Dept Account'
                        : 'Create SM Account'}
                    </h2>
                    <p className="text-white/25 text-xs">Prototype Registration</p>
                  </div>
                </div>
              </div>

              <div className="h-px w-full" style={{ background: 'rgba(255,255,255,0.06)' }} />

              {signUpError && (
                <div className="rounded-xl p-3 text-xs flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{signUpError}</span>
                </div>
              )}

              <form onSubmit={handleSignUpSubmit} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className={labelClass}>Full Name</label>
                    <input type="text" value={signUpFullName} onChange={(e) => setSignUpFullName(e.target.value)} placeholder="e.g. Ramesh Varma" required className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>{selectedRole === 'ADMIN' ? 'Admin ID' : 'Employee ID'}</label>
                    <input
                      type="text"
                      value={signUpEmployeeId}
                      onChange={(e) => setSignUpEmployeeId(e.target.value)}
                      placeholder={selectedRole === 'ADMIN' ? 'e.g. ADM-002' : selectedRole === 'STATION_MASTER' ? 'e.g. SM-GNT-002' : 'e.g. ENG-305'}
                      required
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Admin specific field */}
                {selectedRole === 'ADMIN' && (
                  <div className="space-y-1.5">
                    <label className={labelClass}>Designation</label>
                    <input type="text" value={signUpDesignation} onChange={(e) => setSignUpDesignation(e.target.value)} placeholder="e.g. Sr. Operations Executive" required className={inputClass} />
                  </div>
                )}

                {/* Station Master specific field */}
                {selectedRole === 'STATION_MASTER' && (
                  <div className="space-y-1.5">
                    <label className={labelClass}>Station</label>
                    <select value={signUpStation} onChange={(e) => setSignUpStation(e.target.value)} className={inputClass}>
                      <option value="Guntur Railway Station">Guntur Railway Station (GNT)</option>
                      <option value="Vijayawada Junction">Vijayawada Junction (BZA)</option>
                      <option value="Narasaraopet">Narasaraopet (NRT)</option>
                      <option value="Tenali Junction">Tenali Junction (TEL)</option>
                    </select>
                  </div>
                )}

                {/* Department specific field */}
                {selectedRole === 'DEPARTMENT' && (
                  <div className="space-y-1.5">
                    <label className={labelClass}>Department</label>
                    <select value={signUpDept} onChange={(e) => setSignUpDept(e.target.value as DepartmentType)} className={inputClass}>
                      <option value="Engineering">Engineering (Track Defects)</option>
                      <option value="Traction">Traction (OHE &amp; Substation Defects)</option>
                      <option value="Signal &amp; Telecom">Signal &amp; Telecom (Signal/Telecom Faults)</option>
                      <option value="Electrical">Electrical (Equipment Failures)</option>
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className={labelClass}>Official Contact</label>
                  <input type="text" value={signUpContact} onChange={(e) => setSignUpContact(e.target.value)} placeholder="Official Mobile / Contact Number" required className={inputClass} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className={labelClass}>Create Password</label>
                    <input type="password" value={signUpPassword} onChange={(e) => setSignUpPassword(e.target.value)} placeholder="Create Password" required className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Confirm Password</label>
                    <input type="password" value={signUpConfirmPassword} onChange={(e) => setSignUpConfirmPassword(e.target.value)} placeholder="Confirm Password" required className={inputClass} />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white transition-all duration-200 cursor-pointer mt-2"
                  style={{
                    background: `linear-gradient(135deg, ${roleAccent}, ${roleAccent}cc)`,
                    boxShadow: `0 4px 20px ${roleAccent}30`,
                  }}
                >
                  <span>Create Account</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <div className="text-center pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <button type="button" onClick={() => setStep('login-form')} className="text-xs text-white/30 hover:text-white transition-colors cursor-pointer">
                    Already have an account? <span className="font-bold hover:underline" style={{ color: roleAccent }}>Sign In</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ============== STEP 4: FORGOT PASSWORD ============== */}
          {step === 'forgot-password' && (
            <div className="animate-fade-slide-up space-y-5">
              {/* Back button */}
              <button
                onClick={() => setStep('login-form')}
                className="flex items-center gap-2 text-white/30 hover:text-white text-xs font-medium transition-colors cursor-pointer group"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                Return to Login
              </button>

              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
                  <RefreshCw className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-white font-extrabold text-lg tracking-tight uppercase">Forgot Password</h2>
                  <p className="text-white/25 text-xs">Identity Recovery & Reset</p>
                </div>
              </div>

              <div className="h-px w-full" style={{ background: 'rgba(255,255,255,0.06)' }} />

              {fpError && (
                <div className="rounded-xl p-3 text-xs flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{fpError}</span>
                </div>
              )}

              {/* FP STEP 1: VERIFY IDENTITY */}
              {fpStep === 'verify-id' && (
                <form onSubmit={handleFpVerifyId} className="space-y-4">
                  <p className="text-xs text-white/30">
                    Enter your {selectedRole === 'ADMIN' ? 'Admin ID' : 'Employee ID'} to recover your account.
                  </p>

                  <div className="space-y-2">
                    <label className={labelClass}>{selectedRole === 'ADMIN' ? 'Admin ID' : 'Employee ID'}</label>
                    <input
                      type="text"
                      value={fpId}
                      onChange={(e) => setFpId(e.target.value)}
                      placeholder={selectedRole === 'ADMIN' ? 'Enter Admin ID (e.g. ADM-001)' : 'Enter Employee ID (e.g. SM-GNT-104)'}
                      required
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className={labelClass}>Registered Contact</label>
                    <input
                      type="text"
                      value={fpContact}
                      onChange={(e) => setFpContact(e.target.value)}
                      placeholder="Official Mobile Number / Internal Extension"
                      required
                      className={inputClass}
                    />
                  </div>

                  <button type="submit" className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white cursor-pointer" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 4px 20px rgba(59,130,246,0.3)' }}>
                    <span>Verify Identity</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* FP STEP 2: VERIFY CODE */}
              {fpStep === 'verify-code' && (
                <form onSubmit={handleFpVerifyCode} className="space-y-4">
                  <div className="p-3 rounded-xl text-xs font-bold flex items-center gap-2" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }}>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>✓ Identity verified</span>
                  </div>

                  <div className="space-y-2">
                    <label className={labelClass}>Verification Code</label>
                    <input
                      type="text"
                      value={fpCode}
                      onChange={(e) => setFpCode(e.target.value)}
                      placeholder="Enter 6-digit Code (e.g. 123456)"
                      required
                      className={`${inputClass} font-mono`}
                    />
                  </div>

                  <button type="submit" className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white cursor-pointer" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 4px 20px rgba(59,130,246,0.3)' }}>
                    <span>Verify Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* FP STEP 3: NEW PASSWORD */}
              {fpStep === 'new-password' && (
                <form onSubmit={handleFpResetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <label className={labelClass}>New Password</label>
                    <input type="password" value={fpNewPass} onChange={(e) => setFpNewPass(e.target.value)} placeholder="Enter New Password" required className={inputClass} />
                  </div>

                  <div className="space-y-2">
                    <label className={labelClass}>Confirm Password</label>
                    <input type="password" value={fpConfirmPass} onChange={(e) => setFpConfirmPass(e.target.value)} placeholder="Confirm New Password" required className={inputClass} />
                  </div>

                  <button type="submit" className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white cursor-pointer" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 4px 20px rgba(59,130,246,0.3)' }}>
                    <span>Reset Password</span>
                    <Lock className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* FP STEP 4: SUCCESS */}
              {fpStep === 'success' && (
                <div className="space-y-4 text-center py-3">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}>
                    <CheckCircle2 className="w-7 h-7 text-green-400" />
                  </div>
                  <h3 className="text-white font-bold text-base">✓ Password reset successfully.</h3>
                  <p className="text-white/30 text-xs">
                    Your prototype authentication password for <span className="text-white font-mono">{fpId}</span> has been updated.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep('login-form')}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white cursor-pointer mt-2"
                    style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 4px 20px rgba(59,130,246,0.3)' }}
                  >
                    Return to Login
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
