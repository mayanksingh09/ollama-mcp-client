import React, { useState, useCallback, useEffect } from 'react';
import type { OllamaClient } from '../../ollama/OllamaClient';
import type { OllamaMCPClient } from '../../client/OllamaMCPClient';

export interface ModelInfo {
  name: string;
  size: number;
  modified: string;
}

export interface UseOllamaOptions {
  autoConnect?: boolean;
  checkInterval?: number;
}

interface UseOllamaReturn {
  isConnected: boolean;
  isChecking: boolean;
  models: ModelInfo[];
  selectedModel: string | null;
  error: string | null;
  checkConnection: () => Promise<void>;
  pullModel: (modelName: string) => Promise<void>;
  deleteModel: (modelName: string) => Promise<void>;
  setSelectedModel: React.Dispatch<React.SetStateAction<string | null>>;
  formatSize: (bytes: number) => string;
}

export const useOllama = (
  client: OllamaClient | OllamaMCPClient,
  options: UseOllamaOptions = {}
): UseOllamaReturn => {
  const { autoConnect = true, checkInterval = 30000 } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check connection status
  const checkConnection = useCallback(async () => {
    setIsChecking(true);
    setError(null);

    try {
      // Check if client has listModels method (OllamaClient)
      if ('listModels' in client) {
        const response = await client.listModels();
        const modelList = response.models || [];

        setModels(
          modelList.map((m) => ({
            name: m.name,
            size: m.size,
            modified: m.modified_at,
          }))
        );
        setIsConnected(true);

        // Auto-select first model if none selected
        if (!selectedModel && modelList.length > 0) {
          setSelectedModel(modelList[0].name);
        }
      } else {
        // For OllamaMCPClient, just check if it exists
        setIsConnected(true);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      setError(errorMessage);
      setIsConnected(false);
      setModels([]);
    } finally {
      setIsChecking(false);
    }
  }, [client, selectedModel]);

  // Pull a model
  const pullModel = useCallback(
    async (modelName: string) => {
      setError(null);

      try {
        if ('pull' in client && typeof client.pull === 'function') {
          const clientWithPull = client as OllamaClient & {
            pull: (params: { model: string }) => Promise<void>;
          };
          await clientWithPull.pull({ model: modelName });
          // Refresh models list after pull
          await checkConnection();
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to pull model';
        setError(errorMessage);
      }
    },
    [client, checkConnection]
  );

  // Delete a model
  const deleteModel = useCallback(
    async (modelName: string) => {
      setError(null);

      try {
        if ('delete' in client && typeof client.delete === 'function') {
          const clientWithDelete = client as OllamaClient & {
            delete: (params: { model: string }) => Promise<void>;
          };
          await clientWithDelete.delete({ model: modelName });
          // Clear selection if deleted model was selected
          if (selectedModel === modelName) {
            setSelectedModel(null);
          }
          // Refresh models list
          await checkConnection();
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete model';
        setError(errorMessage);
      }
    },
    [client, selectedModel, checkConnection]
  );

  // Format model size for display
  const formatSize = useCallback((bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      checkConnection();
    }
  }, [autoConnect, checkConnection]);

  // Periodic connection checks
  useEffect(() => {
    if (checkInterval > 0) {
      const interval = setInterval(checkConnection, checkInterval);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [checkInterval, checkConnection]);

  return {
    isConnected,
    isChecking,
    models,
    selectedModel,
    error,
    checkConnection,
    pullModel,
    deleteModel,
    setSelectedModel,
    formatSize,
  };
};
