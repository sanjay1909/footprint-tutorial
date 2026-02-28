import { Routes, Route } from 'react-router-dom';
import { TutorialPage } from './pages/TutorialPage';
import { DebuggerPage } from './pages/DebuggerPage';
import { WizardPage } from './pages/WizardPage';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<TutorialPage />} />
      <Route path="/debugger" element={<DebuggerPage />} />
      <Route path="/wizard" element={<WizardPage />} />
    </Routes>
  );
}

export default App;
