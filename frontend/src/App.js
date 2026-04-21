import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";

import Home from "@/pages/Home";
import Reader from "@/pages/Reader";
import Live from "@/pages/Live";
import NotFound from "@/pages/NotFound";

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/reader" element={<Reader />} />
          <Route path="/live" element={<Live />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-center" richColors />
    </div>
  );
}
