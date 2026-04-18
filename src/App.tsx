import { useTheme } from './lib/useTheme';
import { MatchdayScreen } from './screens/MatchdayScreen';
import './styles/globals.css';

export default function App() {
  const { toggle, isDark } = useTheme();
  return <MatchdayScreen onThemeToggle={toggle} isDark={isDark} />;
}
