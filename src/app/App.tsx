import { RouterProvider } from 'react-router';
import { router } from './routes';
import { Toaster } from 'sonner';
import { ThemeProvider } from './context/theme-context';

function App() {
  return (
    <ThemeProvider>
      <Toaster position="top-right" richColors />
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

export default App;