import axios from 'axios';
import type { Layout } from 'react-grid-layout';
import type { WidgetState } from '../stores/types';

const apiClient = axios.create({
  baseURL: '/api', // Vite 프록시 설정을 통해 /api 요청을 백엔드로 전달
});

// 대시보드 레이아웃
export const getDashboardLayout = async (userId: string): Promise<Layout[]> => {
  try {
    const response = await apiClient.get<Layout[]>(`/dashboard/layout?userId=${userId}`);
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Failed to get dashboard layout:', error);
    return [];
  }
};

export const saveDashboardLayout = async (userId: string, layout: Layout[]): Promise<void> => {
  try {
    await apiClient.post('/dashboard/layout', { userId, layout });
  } catch (error) {
    console.error('Failed to save dashboard layout:', error);
  }
};

// 위젯 상태
export const getWidgets = async (userId: string): Promise<WidgetState[]> => {
  try {
    const response = await apiClient.get<WidgetState[]>(`/widgets?userId=${userId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to get widgets:', error);
    return [];
  }
};

export const saveWidgets = async (widgets: WidgetState[]): Promise<void> => {
  try {
    await apiClient.post('/widgets', widgets);
  } catch (error) {
    console.error('Failed to save widgets:', error);
  }
};

export const deleteWidget = async (userId: string, widgetId: string): Promise<void> => {
  try {
    await apiClient.delete(`/widgets?userId=${userId}&widgetId=${widgetId}`);
  } catch (error) {
    console.error('Failed to delete widget:', error);
  }
}; 