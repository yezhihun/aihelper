import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { CompanionPanel } from './CompanionPanel';
import './styles.css';

function App() {
  const [incomingQuestion, setIncomingQuestion] = useState<string | null>(null);

  const onIncomingHandled = useCallback(() => {
    setIncomingQuestion(null);
  }, []);

  useEffect(() => {
    void (async () => {
      let granted = await isPermissionGranted();
      if (!granted) {
        const perm = await requestPermission();
        granted = perm === 'granted';
      }
    })();
  }, []);

  useEffect(() => {
    const unlistenPromise = listen<string>('enhance-request', (event) => {
      setIncomingQuestion(event.payload ?? '');
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <CompanionPanel incomingQuestion={incomingQuestion} onIncomingHandled={onIncomingHandled} />
  );
}

export default App;
