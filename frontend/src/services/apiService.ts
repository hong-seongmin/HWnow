import axios from 'axios';
import type { Layout } from 'react-grid-layout';
import type { WidgetState, PageState } from '../stores/types';

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
export const getWidgets = async (userId: string, pageId: string = 'main-page'): Promise<WidgetState[]> => {
  try {
    const response = await apiClient.get<WidgetState[]>(`/widgets?userId=${userId}&pageId=${pageId}`);
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

export const deleteWidget = async (userId: string, widgetId: string, pageId: string = 'main-page'): Promise<void> => {
  try {
    await apiClient.delete(`/widgets?userId=${userId}&widgetId=${widgetId}&pageId=${pageId}`);
  } catch (error) {
    console.error('Failed to delete widget:', error);
  }
};

// 페이지 관리
export const getPages = async (userId: string): Promise<PageState[]> => {
  try {
    const response = await apiClient.get<PageState[]>(`/pages?userId=${userId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to get pages:', error);
    return [];
  }
};

export const createPage = async (userId: string, pageId: string, pageName: string): Promise<void> => {
  try {
    await apiClient.post('/pages', { userId, pageId, pageName });
  } catch (error) {
    console.error('Failed to create page:', error);
    throw error;
  }
};

export const deletePage = async (userId: string, pageId: string): Promise<void> => {
  try {
    await apiClient.delete(`/pages?userId=${userId}&pageId=${pageId}`);
  } catch (error) {
    console.error('Failed to delete page:', error);
    throw error;
  }
};

export const updatePageName = async (userId: string, pageId: string, pageName: string): Promise<void> => {
  try {
    await apiClient.put('/pages/name', { userId, pageId, pageName });
  } catch (error) {
    console.error('Failed to update page name:', error);
    throw error;
  }
}; 