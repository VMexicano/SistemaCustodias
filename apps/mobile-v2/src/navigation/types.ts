export interface Stop {
  lat: number;
  lng: number;
  address: string;
}

export type PassengerStackParamList = {
  Home: undefined;
  SessionMenu: undefined;
  Estimate: {
    originLat: number;
    originLng: number;
    originAddress: string;
    stops: Stop[];
  };
  CargoDeclaration: {
    tripTypeId: string;
    originLat: number;
    originLng: number;
    originAddress: string;
    stops: Stop[];
    estimatedFare: number;
  };
  ActiveTrip: undefined;
  ScheduleConfirm: {
    originLat: number;
    originLng: number;
    originAddress: string;
    stops: Stop[];
    tripTypeId: string;
    tripTypeName: string;
    estimatedFare: number;
  };
  ScheduledTrips: undefined;
};

export type DriverStackParamList = {
  Online: undefined;
  SessionMenu: undefined;
  DriverActiveTrip: undefined;
  CustodyEvent: { tripId: string };
  TemperatureLog: {
    tripId: string;
    setpoints?: { min_celsius: number; max_celsius: number };
  };
};

export type CustodyClientStackParamList = {
  SelectCustodyType: undefined;
  NewCustodyOrder: undefined;
  ValueDeclaration: { orderId: string };
};

export type CustodyOperatorStackParamList = {
  CustodyOperatorHome: undefined;
  CustodyActiveOrder: { orderId: string };
};

export type RootStackParamList = {
  Login: undefined;
  PassengerStack: undefined;
  DriverStack: undefined;
  CustodyClientStack: undefined;
  CustodyOperatorStack: undefined;
};
