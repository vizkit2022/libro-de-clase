import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout/Layout';
import LoginPage from './pages/Login/LoginPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import UsersPage from './pages/Users/UsersPage';
import ParametersPage from './pages/Parameters/ParametersPage';
import PeriodsPage from './pages/Periods/PeriodsPage';
import CoursesPage from './pages/Courses/CoursesPage';
import CourseDetailPage from './pages/Courses/CourseDetailPage';
import SubjectsPage from './pages/Subjects/SubjectsPage';
import GradesPage from './pages/Management/GradesPage';
import StudentLifePage from './pages/Management/StudentLifePage';
import ReportsPage from './pages/Reports/ReportsPage';
import ApoderadoPage from './pages/Apoderado/ApoderadoPage';
import OcrAnnotationPage from './pages/Management/OcrAnnotationPage';
import SubjectCurriculumPage from './pages/Courses/SubjectCurriculumPage';

// Super Admin
import SuperAdminLayout from './pages/SuperAdmin/SuperAdminLayout';
import SuperAdminDashboard from './pages/SuperAdmin/SuperAdminDashboard';
import SchoolsManagementPage, { SchoolFormPage, SchoolDetailPage } from './pages/SuperAdmin/SchoolsManagementPage';
import SubscriptionsPage from './pages/SuperAdmin/SubscriptionsPage';

const RedirectByRole = () => {
  const { user } = useAuth();
  if (user?.role === 'apoderado') return <Navigate to="/apoderado" replace />;
  if (user?.role === 'super_admin') return <Navigate to="/super-admin" replace />;
  return <Navigate to="/dashboard" replace />;
};

const PrivateRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>
      <div style={{textAlign:'center'}}>
        <div className="spinner" />
        <p style={{color:'#64748b',marginTop:'12px'}}>Cargando...</p>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    if (user.role === 'apoderado') return <Navigate to="/apoderado" replace />;
    if (user.role === 'super_admin') return <Navigate to="/super-admin" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Portal Super Admin (layout propio) */}
          <Route path="/super-admin" element={
            <PrivateRoute roles={['super_admin']}>
              <SuperAdminLayout />
            </PrivateRoute>
          }>
            <Route index element={<SuperAdminDashboard />} />
            <Route path="schools" element={<SchoolsManagementPage />} />
            <Route path="schools/new" element={<SchoolFormPage />} />
            <Route path="schools/:id" element={<SchoolDetailPage />} />
            <Route path="schools/:id/edit" element={<SchoolFormPage />} />
            <Route path="subscriptions" element={<SubscriptionsPage />} />
          </Route>

          {/* App normal de colegios */}
          <Route path="/" element={
            <PrivateRoute roles={['admin','directivo','profesor','apoderado','alumno']}>
              <Layout />
            </PrivateRoute>
          }>
            <Route index element={<RedirectByRole />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="users" element={<PrivateRoute roles={['admin','directivo']}><UsersPage /></PrivateRoute>} />
            <Route path="parameters" element={<PrivateRoute roles={['admin','directivo']}><ParametersPage /></PrivateRoute>} />
            <Route path="periods" element={<PrivateRoute roles={['admin','directivo']}><PeriodsPage /></PrivateRoute>} />
            <Route path="courses" element={<CoursesPage />} />
            <Route path="courses/:id" element={<CourseDetailPage />} />
            <Route path="courses/:courseId/subject/:courseSubjectId" element={<SubjectCurriculumPage />} />
            <Route path="subjects" element={<PrivateRoute roles={['admin','directivo','profesor']}><SubjectsPage /></PrivateRoute>} />
            <Route path="grades" element={<PrivateRoute roles={['admin','directivo','profesor']}><GradesPage /></PrivateRoute>} />
            <Route path="students/:id/life" element={<StudentLifePage />} />
            <Route path="reports" element={<PrivateRoute roles={['admin','directivo','profesor']}><ReportsPage /></PrivateRoute>} />
            <Route path="apoderado" element={<PrivateRoute roles={['apoderado']}><ApoderadoPage /></PrivateRoute>} />
            <Route path="ocr-annotations" element={<PrivateRoute roles={['admin','directivo','profesor']}><OcrAnnotationPage /></PrivateRoute>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
