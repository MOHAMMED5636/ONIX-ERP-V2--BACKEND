// ============================================
// EXAMPLE: Update Project Create/Edit Pages
// Copy relevant parts to your Project components
// ============================================

import { useNavigate } from 'react-router-dom';
import { createProject, updateProject } from '../services/projectsAPI';

// ============================================
// PROJECT CREATE COMPONENT EXAMPLE
// ============================================

const CreateProject = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (projectData) => {
    try {
      setLoading(true);
      
      // Create project
      const response = await createProject(projectData);
      
      if (response.success) {
        // Navigate to dashboard with refresh flag
        // This will trigger dashboard to refresh and show updated counts
        navigate('/dashboard', { 
          state: { refreshDashboard: true } 
        });
        
        // OR navigate to project details
        // navigate(`/projects/${response.data.id}`, {
        //   state: { returnTo: '/dashboard' }
        // });
      }
    } catch (error) {
      console.error('Error creating project:', error);
      // Handle error (show toast, etc.)
    } finally {
      setLoading(false);
    }
  };

  return (
    // Your form JSX here
  );
};

// ============================================
// PROJECT EDIT COMPONENT EXAMPLE
// ============================================

const EditProject = ({ projectId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (projectData) => {
    try {
      setLoading(true);
      
      // Update project
      const response = await updateProject(projectId, projectData);
      
      if (response.success) {
        // Navigate to dashboard with refresh flag
        navigate('/dashboard', { 
          state: { refreshDashboard: true } 
        });
        
        // OR navigate back to project details
        // navigate(`/projects/${projectId}`, {
        //   state: { returnTo: '/dashboard' }
        // });
      }
    } catch (error) {
      console.error('Error updating project:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    // Your form JSX here
  );
};

// ============================================
// TASK CREATE COMPONENT EXAMPLE
// ============================================

const CreateTask = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (taskData) => {
    try {
      setLoading(true);
      
      // Create task
      const response = await createTask(taskData);
      
      if (response.success) {
        // Navigate to dashboard with refresh flag
        navigate('/dashboard', { 
          state: { refreshDashboard: true } 
        });
      }
    } catch (error) {
      console.error('Error creating task:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    // Your form JSX here
  );
};

// ============================================
// TASK EDIT COMPONENT EXAMPLE
// ============================================

const EditTask = ({ taskId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (taskData) => {
    try {
      setLoading(true);
      
      // Update task (including status changes)
      const response = await updateTask(taskId, taskData);
      
      if (response.success) {
        // Navigate to dashboard with refresh flag
        navigate('/dashboard', { 
          state: { refreshDashboard: true } 
        });
      }
    } catch (error) {
      console.error('Error updating task:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    // Your form JSX here
  );
};

// ============================================
// TASK STATUS UPDATE EXAMPLE (Kanban Board)
// ============================================

const KanbanBoard = () => {
  const navigate = useNavigate();

  const handleTaskStatusChange = async (taskId, newStatus) => {
    try {
      // Update task status
      await updateTaskStatus(taskId, newStatus);
      
      // Option 1: Refresh dashboard immediately (if on same page)
      // refreshDashboard();
      
      // Option 2: Navigate to dashboard to see updated counts
      // navigate('/dashboard', { state: { refreshDashboard: true } });
      
      // Option 3: Stay on page but show notification
      // showToast('Task status updated');
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  return (
    // Your Kanban board JSX here
  );
};

// ============================================
// USING WITH REACT ROUTER
// ============================================

// In your App.js or router configuration:
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import CreateProject from './pages/CreateProject';
import EditProject from './pages/EditProject';
import CreateTask from './pages/CreateTask';
import EditTask from './pages/EditTask';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects/new" element={<CreateProject />} />
        <Route path="/projects/:id/edit" element={<EditProject />} />
        <Route path="/tasks/new" element={<CreateTask />} />
        <Route path="/tasks/:id/edit" element={<EditTask />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;


