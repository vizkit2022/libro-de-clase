# 📚 Libro de Clases Digital
### Sistema de Gestión Escolar para Colegios

---

## 🚀 Inicio rápido

### Opción 1: Script automático (Mac/Linux)
```bash
chmod +x start.sh
./start.sh
```

### Opción 2: Manual

**Backend (Flask):**
```bash
cd backend
pip install -r requirements.txt
python app.py
# API en http://localhost:5000
```

**Frontend (React):**
```bash
cd frontend
npm install
npm start
# App en http://localhost:3000
```

---

## 👤 Accesos de prueba

| Rol        | Email                          | Contraseña  |
|------------|--------------------------------|-------------|
| Admin      | admin@sanpatricio.cl           | admin123    |
| Directivo  | directivo@sanpatricio.cl       | dir123      |
| Profesor   | mvaldes@sanpatricio.cl         | prof123     |
| Alumno     | pedro.alvarado@gmail.com       | alumno123   |

---

## 📋 Módulos disponibles

### 1. 🔐 Autenticación y Perfiles
- Login con JWT
- 5 roles: Admin, Directivo, Profesor, Apoderado, Alumno
- Cada rol ve solo lo que le corresponde

### 2. 🏫 Parámetros del Colegio
- Información institucional completa
- Personalización de colores (multi-empresa)
- Logo y datos de contacto

### 3. 📅 Períodos Académicos
- Tipos: Anual, Semestral, Trimestral, Mensual
- Múltiples años
- Fechas de inicio y fin

### 4. 📚 Cursos
- Configuración de curso
- Matrícula de alumnos
- Asignación de profesor jefe
- Gestión de asignaturas por curso

### 5. 📖 Asignaturas
- Catálogo del colegio
- Conexión con asignaturas del Ministerio de Educación Chile
- Colores identificadores

### 6. ✏️ Calificaciones
- Calificar por asignatura (ingreso masivo)
- Vista general del curso (tabla completa)
- Promedios automáticos

### 7. 👤 Hoja de Vida del Alumno
- Historial completo de notas
- Anotaciones positivas/negativas/neutras/académicas
- Datos personales

### 8. 📊 Reportes
- Informe de notas por curso y período
- Estadísticas del colegio
- Impresión directa

---

## 🛠 Stack tecnológico

**Backend:**
- Python 3.x + Flask
- SQLAlchemy + SQLite
- JWT Authentication
- Flask-CORS

**Frontend:**
- React 18
- React Router v6
- Axios (HTTP client)
- CSS personalizado (sin frameworks externos)

---

## 📁 Estructura del proyecto

```
├── backend/
│   ├── app.py           # App principal + seed data
│   ├── models.py        # Modelos de BD
│   ├── requirements.txt
│   └── routes/
│       ├── auth.py
│       ├── users.py
│       ├── schools.py
│       ├── periods.py
│       ├── courses.py
│       ├── subjects.py
│       ├── grades.py
│       ├── annotations.py
│       └── reports.py
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── context/AuthContext.js
│   │   ├── components/Layout/
│   │   └── pages/
│   │       ├── Login/
│   │       ├── Dashboard/
│   │       ├── Users/
│   │       ├── Parameters/
│   │       ├── Periods/
│   │       ├── Courses/
│   │       ├── Subjects/
│   │       ├── Management/
│   │       └── Reports/
│   └── package.json
├── start.sh
└── README.md
```

---

## 🔮 Próximas mejoras sugeridas
- [ ] Módulo de apoderados (ver notas de sus hijos)
- [ ] Notificaciones por email
- [ ] Exportar reportes a PDF/Excel
- [ ] App móvil
- [ ] Integración directa con el MINEDUC
- [ ] Sistema de asistencia
- [ ] Horarios de clases
