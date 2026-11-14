import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { Layout } from "@/components/Layout";
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Experiments = lazy(() => import("@/pages/Experiments"));
const ExperimentDetail = lazy(() => import("@/pages/ExperimentDetail"));
import NotFound from "@/pages/NotFound";
import { Loading } from "@/components/ui/primitives";
const Compare = lazy(() => import("@/pages/Compare"));
const Assistant = lazy(() => import("@/pages/Assistant"));
const Safety = lazy(() => import("@/pages/Safety"));
const Reports = lazy(() => import("@/pages/Reports"));

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Layout>
          <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/experiments" element={<Experiments />} />
            <Route path="/experiments/:accession" element={<ExperimentDetail />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/safety" element={<Safety />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
