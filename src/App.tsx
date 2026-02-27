import { Routes, Route } from 'react-router-dom';
import { TutorialPage } from './pages/TutorialPage';
import { DebuggerPage } from './pages/DebuggerPage';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<TutorialPage />} />
      <Route path="/debugger" element={<DebuggerPage />} />
    </Routes>
  );
}

export default App;
