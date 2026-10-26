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
import ProfesorPage from './pages/Profesor/ProfesorPage';
import StudentFichaPage from './pages/Students/StudentFichaPage';
import AniosPage from './pages/Anios/AniosPage';
import AuditoriaPage from './pages/Auditoria/AuditoriaPage';
import StudentImportPage from './pages/Students/StudentImportPage';
import ConvivenciaDashboard from './pages/Convivencia/ConvivenciaDashboard';
import ConvivenciaCasosPage, { ConvivenciaCasoForm } from './pages/Convivencia/ConvivenciaCasosPage';
import ConvivenciaCasoDetail from './pages/Convivencia/ConvivenciaCasoDetail';
import CargaAcademicaDashboard from './pages/CargaAcademica/CargaAcademicaDashboard';
import CargaDocenteDetail from './pages/CargaAcademica/CargaDocenteDetail';
import MatriculaPage from './pages/Matricula/MatriculaPage';
import OnboardingPage from './pages/Onboarding/OnboardingPage';
import PersonalidadCursosPage, { PersonalidadCursoPage, PersonalidadAlumnoPage } from './pages/Personalidad/PersonalidadPage';
import PlanPage from './pages/Plan/PlanPage';
import PersonalidadPautaPage from './pages/Personalidad/PersonalidadPautaPage';

// Super Admin
import SuperAdminLayout from './pages/SuperAdmin/SuperAdminLayout';
import SuperAdminDashboard from './pages/SuperAdmin/SuperAdminDashboard';
import SchoolsManagementPage, { SchoolFormPage, SchoolDetailPage } from './pages/SuperAdmin/SchoolsManagementPage';
import SubscriptionsPage from './pages/SuperAdmin/SubscriptionsPage';
import AdminsPage from './pages/SuperAdmin/AdminsPage';

const RedirectByRole = () => {
  const { user } = useAuth();
  if (user?.role === 'apoderado') return <Navigate to="/apoderado" replace />;
  if (user?.role === 'super_admin') return <Navigate to="/super-admin" replace />;
  if (user?.role === 'profesor') return <Navigate to="/mis-cursos" replace />;
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
    if (user.role === 'profesor') return <Navigate to="/mis-cursos" replace />;
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
            <Route path="admins" element={<AdminsPage />} />
            <Route path="auditoria" element={<AuditoriaPage />} />
          </Route>

          {/* App normal de colegios */}
          <Route path="/" element={
            <PrivateRoute roles={['admin','directivo','profesor','apoderado','alumno']}>
              <Layout />
            </PrivateRoute>
          }>
            <Route index element={<RedirectByRole />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="onboarding" element={<PrivateRoute roles={['admin','directivo']}><OnboardingPage /></PrivateRoute>} />
            <Route path="users" element={<PrivateRoute roles={['admin','directivo']}><UsersPage /></PrivateRoute>} />
            <Route path="parameters" element={<PrivateRoute roles={['admin','directivo']}><ParametersPage /></PrivateRoute>} />
            <Route path="plan" element={<PrivateRoute roles={['admin','directivo']}><PlanPage /></PrivateRoute>} />
            <Route path="anios" element={<PrivateRoute roles={['admin','directivo']}><AniosPage /></PrivateRoute>} />
            <Route path="auditoria" element={<PrivateRoute roles={['admin']}><AuditoriaPage /></PrivateRoute>} />
            <Route path="periods" element={<PrivateRoute roles={['admin','directivo']}><PeriodsPage /></PrivateRoute>} />
            <Route path="courses" element={<PrivateRoute roles={['admin','directivo','profesor']}><CoursesPage /></PrivateRoute>} />
            <Route path="courses/:id" element={<PrivateRoute roles={['admin','directivo','profesor']}><CourseDetailPage /></PrivateRoute>} />
            <Route path="courses/:courseId/subject/:courseSubjectId" element={<PrivateRoute roles={['admin','directivo','profesor']}><SubjectCurriculumPage /></PrivateRoute>} />
            <Route path="subjects" element={<PrivateRoute roles={['admin','directivo','profesor']}><SubjectsPage /></PrivateRoute>} />
            <Route path="grades" element={<PrivateRoute roles={['admin','directivo','profesor']}><GradesPage /></PrivateRoute>} />
            <Route path="students/import" element={<PrivateRoute roles={['admin','directivo']}><StudentImportPage /></PrivateRoute>} />
            <Route path="students/:id/ficha" element={<PrivateRoute roles={['admin','directivo','profesor','apoderado','alumno']}><StudentFichaPage /></PrivateRoute>} />
            <Route path="students/:id/life" element={<PrivateRoute roles={['admin','directivo','profesor','apoderado','alumno']}><StudentLifePage /></PrivateRoute>} />
            <Route path="reports" element={<PrivateRoute roles={['admin','directivo','profesor']}><ReportsPage /></PrivateRoute>} />
            <Route path="apoderado" element={<PrivateRoute roles={['apoderado']}><ApoderadoPage /></PrivateRoute>} />
            <Route path="mis-cursos" element={<PrivateRoute roles={['profesor']}><ProfesorPage /></PrivateRoute>} />
            <Route path="ocr-annotations" element={<PrivateRoute roles={['admin','directivo','profesor']}><OcrAnnotationPage /></PrivateRoute>} />
            {/* Módulo Convivencia */}
            <Route path="convivencia" element={<PrivateRoute roles={['admin','directivo','profesor']}><ConvivenciaDashboard /></PrivateRoute>} />
            <Route path="convivencia/casos" element={<PrivateRoute roles={['admin','directivo','profesor']}><ConvivenciaCasosPage /></PrivateRoute>} />
            <Route path="convivencia/casos/nuevo" element={<PrivateRoute roles={['admin','directivo','profesor']}><ConvivenciaCasoForm /></PrivateRoute>} />
            <Route path="convivencia/casos/:id" element={<PrivateRoute roles={['admin','directivo','profesor']}><ConvivenciaCasoDetail /></PrivateRoute>} />
            <Route path="convivencia/casos/:id/editar" element={<PrivateRoute roles={['admin','directivo','profesor']}><ConvivenciaCasoForm /></PrivateRoute>} />
            {/* Gestión docente: informe de personalidad */}
            <Route path="personalidad" element={<PrivateRoute roles={['admin','directivo','profesor']}><PersonalidadCursosPage /></PrivateRoute>} />
            <Route path="personalidad/pauta" element={<PrivateRoute roles={['admin','directivo']}><PersonalidadPautaPage /></PrivateRoute>} />
            <Route path="personalidad/cursos/:courseId" element={<PrivateRoute roles={['admin','directivo','profesor']}><PersonalidadCursoPage /></PrivateRoute>} />
            <Route path="personalidad/cursos/:courseId/alumnos/:studentId" element={<PrivateRoute roles={['admin','directivo','profesor']}><PersonalidadAlumnoPage /></PrivateRoute>} />
            {/* Módulo Carga Académica */}
            <Route path="matricula" element={<PrivateRoute roles={['admin','directivo']}><MatriculaPage /></PrivateRoute>} />
            <Route path="carga-academica" element={<PrivateRoute roles={['admin','directivo']}><CargaAcademicaDashboard /></PrivateRoute>} />
            <Route path="carga-academica/docentes/:id" element={<PrivateRoute roles={['admin','directivo']}><CargaDocenteDetail /></PrivateRoute>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
