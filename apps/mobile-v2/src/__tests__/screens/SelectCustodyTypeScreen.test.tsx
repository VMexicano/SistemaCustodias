import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SelectCustodyTypeScreen from '../../screens/client/SelectCustodyTypeScreen';
import { apiClient } from '../../services/api.client';

jest.mock('../../services/api.client', () => ({
  apiClient: { get: jest.fn() },
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockSetDraft = jest.fn();
jest.mock('../../stores/custody.store', () => ({
  useCustodyStore: () => ({ setDraft: mockSetDraft }),
}));

const mockGet = apiClient.get as jest.Mock;

const mockTypes = [
  {
    id: 'type-1',
    slug: 'cash_transport',
    name: 'Transporte de Efectivo',
    description: 'Efectivo y cheques',
    valueDeclarationSchema: { type: 'object', required: ['amount_mxn'], properties: {} },
  },
  {
    id: 'type-2',
    slug: 'confidential_docs',
    name: 'Documentos Confidenciales',
    description: null,
    valueDeclarationSchema: { type: 'object', required: [], properties: {} },
  },
];

describe('SelectCustodyTypeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: mockTypes } });
  });

  it('renders custody types fetched from API', async () => {
    const { getByText } = render(<SelectCustodyTypeScreen />);

    await waitFor(() => {
      expect(getByText('Transporte de Efectivo')).toBeTruthy();
      expect(getByText('Documentos Confidenciales')).toBeTruthy();
    });

    expect(mockGet).toHaveBeenCalledWith('/custody-types');
  });

  it('navigates to NewCustodyOrder when a type is selected', async () => {
    const { getByTestId } = render(<SelectCustodyTypeScreen />);

    await waitFor(() => {
      expect(getByTestId('custody-type-cash_transport')).toBeTruthy();
    });

    fireEvent.press(getByTestId('custody-type-cash_transport'));

    expect(mockSetDraft).toHaveBeenCalledWith(
      expect.objectContaining({ custodyTypeId: 'type-1', custodyTypeName: 'Transporte de Efectivo' }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('NewCustodyOrder');
  });

  it('renders without crashing during load', () => {
    mockGet.mockReturnValue(new Promise(() => undefined));
    const { toJSON } = render(<SelectCustodyTypeScreen />);
    expect(toJSON()).toBeTruthy();
  });
});
