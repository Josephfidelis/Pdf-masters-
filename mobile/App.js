import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from './src/AppContext';
import EditorScreen from './src/screens/EditorScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import HomeScreen from './src/screens/HomeScreen';
import PremiumScreen from './src/screens/PremiumScreen';
import ResultScreen from './src/screens/ResultScreen';
import ScanScreen from './src/screens/ScanScreen';
import ToolScreen from './src/screens/ToolScreen';
import ViewerScreen from './src/screens/ViewerScreen';
import { C } from './src/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const icon = (g) => ({ color }) => <Text style={{ fontSize: 20, color }}>{g}</Text>;

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: C.navy, tabBarInactiveTintColor: '#8aa0bf' }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: icon('⌂') }} />
      <Tab.Screen name="Files" component={HistoryScreen} options={{ tabBarIcon: icon('☰') }} />
      <Tab.Screen name="Premium" component={PremiumScreen} options={{ tabBarIcon: icon('★') }} />
    </Tab.Navigator>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: C.navy }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }}>
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen name="Tool" component={ToolScreen} />
            <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan' }} />
            <Stack.Screen name="Editor" component={EditorScreen} options={{ title: 'PDF Editor' }} />
            <Stack.Screen name="Viewer" component={ViewerScreen} options={({ route }) => ({ title: route.params?.name || 'PDF Viewer' })} />
            <Stack.Screen name="Result" component={ResultScreen} options={{ title: 'Done', headerBackVisible: false }} />
          </Stack.Navigator>
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}
