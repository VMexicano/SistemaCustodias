import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ValueDeclarationScreen from '../../screens/client/ValueDeclarationScreen';
import { apiClient } from '../../services/api.client';

jest.mock('../../services/api.client', () => ({
  apiClient: { post: jest.fn(), patch: jest.fn() },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ popToTop: jest.fn() }),
  useRoute: () => ({ params: { orderId: 'order-uuid' } }),
}));

const mockSchema = {
  type: 'object',
  required: ['amount_mxn', 'currency'],
  properties: {
    amount_mxn: { type: 'number', description: 'Monto total en pesos mexicanos' },
    currency: { type: 'string', enum: ['MXN', 'USD', 'EUR'], description: 'Moneda del efectivo' },
  },
  additionalProperties: false,
};

jest.mock('../../stores/custody.store', () => ({
  useCustodyStore: () => ({
    draft: { valueDeclarationSchema: mockSchema },
    clearDraft: jest.fn(),
  }),
}));

const mockPost = apiClient.post as jest.Mock;
const mockPatch = apiClient.patch as jest.Mock;

describe('ValueDeclarationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPatch.mockResolvedValue({ data: { data: {} } });
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  it('renders fields from value_declaration_schema', () => {
    const { getByTestId, getByText } = render(<ValueDeclarationScreen />);

    expect(getByTestId('input-amount_mxn')).toBeTruthy();
    expect(getByText('MXN')).toBeTruthy();
    expect(getByText('USD')).toBeTruthy();
    expect(getByText('EUR')).toBeTruthy();
  });

  it('renders the submit button', () => {
    const { getByTestId } = render(<ValueDeclarationScreen />);
    expect(getByTestId('btn-submit-order')).toBeTruthy();
  });

  it('calls POST value-declaration and PATCH submit on submit', async () => {
    const { getByTestId } = render(<ValueDeclarationScreen />);

    fireEvent.changeText(getByTestId('input-amount_mxn'), '50000');
    fireEvent.press(getByTestId('enum-currency-MXN'));
    fireEvent.press(getByTestId('btn-submit-order'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/orders/order-uuid/value-declaration',
        expect.objectContaining({ declaredValue: expect.objectContaining({ amount_mxn: 50000 }) }),
      );
      expect(mockPatch).toHaveBeenCalledWith('/orders/order-uuid/submit');
    });
  });

  it('shows success alert after submit', async () => {
    const { getByTestId } = render(<ValueDeclarationScreen />);

    fireEvent.changeText(getByTestId('input-amount_mxn'), '50000');
    fireEvent.press(getByTestId('enum-currency-MXN'));
    fireEvent.press(getByTestId('btn-submit-order'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('¡Orden enviada!', expect.any(String), expect.any(Array));
    });
  });

  it('shows error alert when API call fails', async () => {
    mockPost.mockRejectedValue({
      response: { data: { error: { message: 'Schema inválido' } } },
    });

    const { getByTestId } = render(<ValueDeclarationScreen />);

    fireEvent.changeText(getByTestId('input-amount_mxn'), '50000');
    fireEvent.press(getByTestId('enum-currency-MXN'));
    fireEvent.press(getByTestId('btn-submit-order'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Schema inválido');
    });
  });
});
