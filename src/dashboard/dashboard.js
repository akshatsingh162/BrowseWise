import '../ui/styles/tokens.css';
import '../ui/styles/base.css';
import '../ui/styles/components.css';
import '../ui/styles/ambient.css';
import './styles/dashboard.css';

import { startDashboard } from './app.js';
import { mountAmbient } from '../ui/ambient.js';

mountAmbient();

startDashboard(document.getElementById('app'));
