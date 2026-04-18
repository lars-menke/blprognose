import { useState } from 'react';
import { useTheme } from './lib/useTheme';
import { MatchdayScreen } from './screens/MatchdayScreen';
import { SplashScreen } from './components/SplashScreen';
import './styles/globals.css';

export default function App() {
  const { toggle, isDark } = useTheme();
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <MatchdayScreen onThemeToggle={toggle} isDark={isDark} />
    </>
  );
}
