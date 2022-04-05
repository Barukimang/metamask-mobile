import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavigationContainer, CommonActions } from '@react-navigation/native';
import { Animated } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-community/async-storage';
import Login from '../../Views/Login';
import QRScanner from '../../Views/QRScanner';
import Onboarding from '../../Views/Onboarding';
import OnboardingCarousel from '../../Views/OnboardingCarousel';
import ChoosePassword from '../../Views/ChoosePassword';
import ExtensionSync from '../../Views/ExtensionSync';
import AccountBackupStep1 from '../../Views/AccountBackupStep1';
import AccountBackupStep1B from '../../Views/AccountBackupStep1B';
import ManualBackupStep1 from '../../Views/ManualBackupStep1';
import ManualBackupStep2 from '../../Views/ManualBackupStep2';
import ManualBackupStep3 from '../../Views/ManualBackupStep3';
import ImportFromSeed from '../../Views/ImportFromSeed';
import SyncWithExtensionSuccess from '../../Views/SyncWithExtensionSuccess';
import Main from '../Main';
import OptinMetrics from '../../UI/OptinMetrics';
import MetaMaskAnimation from '../../UI/MetaMaskAnimation';
import SimpleWebview from '../../Views/SimpleWebview';
import SharedDeeplinkManager from '../../../core/DeeplinkManager';
import Engine from '../../../core/Engine';
import branch from 'react-native-branch';
import AppConstants from '../../../core/AppConstants';
import Logger from '../../../util/Logger';
import Device from '../../../util/device';
import { trackErrorAsAnalytics } from '../../../util/analyticsV2';
import { routingInstrumentation } from '../../../util/setupSentry';
import Analytics from '../../../core/Analytics';
import { connect, useSelector, useDispatch } from 'react-redux';
import { EXISTING_USER, CURRENT_APP_VERSION, LAST_APP_VERSION, ONBOARDING_WIZARD } from '../../../constants/storage';
import { getVersion } from 'react-native-device-info';
import { setCurrentRoute } from '../../../actions/navigation';
import { findRouteNameFromNavigatorState } from '../../../util/general';
import { Authentication } from '../../../core/';
import { mockTheme, useAppThemeFromContext } from '../../../util/theme';
import DefaultPreference from 'react-native-default-preference';

const Stack = createStackNavigator();
/**
 * Stack navigator responsible for the onboarding process
 * Create Wallet, Import from Seed and Sync
 */
const OnboardingNav = () => (
	<Stack.Navigator initialRouteName="OnboardingCarousel">
		<Stack.Screen name="Onboarding" component={Onboarding} options={Onboarding.navigationOptions} />
		<Stack.Screen
			name="OnboardingCarousel"
			component={OnboardingCarousel}
			options={OnboardingCarousel.navigationOptions}
		/>
		<Stack.Screen name="ChoosePassword" component={ChoosePassword} options={ChoosePassword.navigationOptions} />
		<Stack.Screen name="ExtensionSync" component={ExtensionSync} />
		<Stack.Screen
			name="AccountBackupStep1"
			component={AccountBackupStep1}
			options={AccountBackupStep1.navigationOptions}
		/>
		<Stack.Screen
			name="AccountBackupStep1B"
			component={AccountBackupStep1B}
			options={AccountBackupStep1B.navigationOptions}
		/>
		<Stack.Screen
			name="ManualBackupStep1"
			component={ManualBackupStep1}
			options={ManualBackupStep1.navigationOptions}
		/>
		<Stack.Screen
			name="ManualBackupStep2"
			component={ManualBackupStep2}
			options={ManualBackupStep2.navigationOptions}
		/>
		<Stack.Screen
			name="ManualBackupStep3"
			component={ManualBackupStep3}
			options={ManualBackupStep3.navigationOptions}
		/>
		<Stack.Screen name="ImportFromSeed" component={ImportFromSeed} options={ImportFromSeed.navigationOptions} />
		<Stack.Screen name="OptinMetrics" component={OptinMetrics} options={OptinMetrics.navigationOptions} />
	</Stack.Navigator>
);

/**
 * Parent Stack navigator that allows the
 * child OnboardingNav navigator to push modals on top of it
 */
const SimpleWebviewScreen = () => (
	<Stack.Navigator mode={'modal'}>
		<Stack.Screen name="SimpleWebview" component={SimpleWebview} options={SimpleWebview.navigationOptions} />
	</Stack.Navigator>
);

const OnboardingRootNav = () => (
	<Stack.Navigator initialRouteName={'OnboardingNav'} mode="modal" screenOptions={{ headerShown: false }}>
		<Stack.Screen name="OnboardingNav" component={OnboardingNav} />
		<Stack.Screen name="SyncWithExtensionSuccess" component={SyncWithExtensionSuccess} />
		<Stack.Screen name="QRScanner" component={QRScanner} header={null} />
		<Stack.Screen name="Webview" header={null} component={SimpleWebviewScreen} />
	</Stack.Navigator>
);

const App = ({ selectedAddress, userLoggedIn }) => {
	const animation = useRef(null);
	const animationName = useRef(null);
	const opacity = useRef(new Animated.Value(1)).current;
	const locked = useRef(false);
	const [navigator, setNavigator] = useState(undefined);
	const prevNavigator = useRef(navigator);
	const [route, setRoute] = useState();
	const [onboarded, setOnboarded] = useState(undefined);
	const [authCancelled, setAuthCancelled] = useState(false);
	const [animationPlayed, setAnimationPlayed] = useState();
	const { colors } = useAppThemeFromContext() || mockTheme;
	const dispatch = useDispatch();
	const triggerSetCurrentRoute = (route) => dispatch(setCurrentRoute(route));
	const frequentRpcList = useSelector(
		(state) => state?.engine?.backgroundState?.PreferencesController?.frequentRpcList
	);

	useEffect(() => {
		const appTriggeredAuth = async () => {
			const existingUser = await AsyncStorage.getItem(EXISTING_USER);
			try {
				if (existingUser && !locked.current && selectedAddress) {
					await Authentication.appTriggeredAuth(selectedAddress);
					console.log('appTriggeredAuth');
					locked.current = true;
					setAuthCancelled(true);
				}

				//Cancel auth if the existing user has not been set
				if (existingUser == null) setAuthCancelled(true);
			} catch (error) {
				await Authentication.logout(false);
				trackErrorAsAnalytics('App: Max Attempts Reached', error?.message, `Unlock attempts: 1`);
				setAuthCancelled(true);
			}
		};
		appTriggeredAuth();
		Authentication.setSelectedAddress(selectedAddress);
	}, [selectedAddress]);

	const handleDeeplink = useCallback(({ error, params, uri }) => {
		if (error) {
			trackErrorAsAnalytics(error, 'Branch:');
		}
		const deeplink = params?.['+non_branch_link'] || uri || null;
		try {
			if (deeplink) {
				const { KeyringController } = Engine.context;
				const isUnlocked = KeyringController.isUnlocked();
				isUnlocked
					? SharedDeeplinkManager.parse(deeplink, { origin: AppConstants.DEEPLINKS.ORIGIN_DEEPLINK })
					: SharedDeeplinkManager.setDeeplink(deeplink);
			}
		} catch (e) {
			Logger.error(e, `Deeplink: Error parsing deeplink`);
		}
	}, []);

	useEffect(() => {
		if (navigator) {
			// Initialize deep link manager
			SharedDeeplinkManager.init({
				navigation: {
					navigate: (routeName, opts) => {
						const params = { name: routeName, params: opts };
						navigator.dispatch?.(CommonActions.navigate(params));
					},
				},
				frequentRpcList,
				dispatch,
			});
			if (!prevNavigator.current) {
				// Setup navigator with Sentry instrumentation
				routingInstrumentation.registerNavigationContainer(navigator);
				// Subscribe to incoming deeplinks
				branch.subscribe({
					onOpenStart: (opts) => {
						// Called reliably on iOS deeplink instances
						Device.isIos() && handleDeeplink(opts);
					},
					onOpenComplete: (opts) => {
						// Called reliably on Android deeplink instances
						Device.isAndroid() && handleDeeplink(opts);
					},
				});
			}
			prevNavigator.current = navigator;
		}
	}, [dispatch, handleDeeplink, frequentRpcList, navigator]);

	useEffect(() => {
		const initAnalytics = async () => {
			await Analytics.init();
		};

		initAnalytics();
	}, []);

	useEffect(() => {
		async function checkExsiting() {
			const onboarded = await DefaultPreference.get(ONBOARDING_WIZARD);
			const existingUser = await AsyncStorage.getItem(EXISTING_USER);
			const route = !existingUser ? 'OnboardingRootNav' : 'Login';
			setOnboarded(onboarded);
			setRoute(route);
		}
		if (userLoggedIn || authCancelled) checkExsiting();
	}, [userLoggedIn, authCancelled]);

	useEffect(() => {
		async function startApp() {
			const existingUser = await AsyncStorage.getItem(EXISTING_USER);
			try {
				const currentVersion = getVersion();
				const savedVersion = await AsyncStorage.getItem(CURRENT_APP_VERSION);
				if (currentVersion !== savedVersion) {
					if (savedVersion) await AsyncStorage.setItem(LAST_APP_VERSION, savedVersion);
					await AsyncStorage.setItem(CURRENT_APP_VERSION, currentVersion);
				}

				const lastVersion = await AsyncStorage.getItem(LAST_APP_VERSION);
				if (!lastVersion) {
					if (existingUser) {
						// Setting last version to first version if user exists and lastVersion does not, to simulate update
						await AsyncStorage.setItem(LAST_APP_VERSION, '0.0.1');
					} else {
						// Setting last version to current version so that it's not treated as an update
						await AsyncStorage.setItem(LAST_APP_VERSION, currentVersion);
					}
				}
			} catch (error) {
				Logger.error(error);
			}

			animation?.current?.play();
			animationName?.current?.play();
		}

		startApp();
	}, []);

	const setNavigatorRef = (ref) => {
		if (!prevNavigator.current) {
			setNavigator(ref);
		}
	};

	const onAnimationFinished = useCallback(() => {
		Animated.timing(opacity, {
			toValue: 0,
			duration: 300,
			useNativeDriver: true,
			isInteraction: false,
		}).start(() => {
			setAnimationPlayed(true);
		});
	}, [opacity]);

	const renderSplash = () => {
		if (!animationPlayed) {
			return (
				<MetaMaskAnimation
					animation={animation}
					animationName={animationName}
					opacity={opacity}
					onAnimationFinish={onAnimationFinished}
				/>
			);
		}
		return null;
	};

	return (
		// do not render unless a route is defined
		(route && (
			<>
				{renderSplash()}
				<NavigationContainer
					// Prevents artifacts when navigating between screens
					theme={{ colors: { background: colors.background.default } }}
					ref={setNavigatorRef}
					onStateChange={(state) => {
						// Updates redux with latest route. Used by DrawerView component.
						const currentRoute = findRouteNameFromNavigatorState(state.routes);
						triggerSetCurrentRoute(currentRoute);
					}}
				>
					{console.log('ROUTE', route, userLoggedIn, onboarded)}
					<Stack.Navigator route={route} initialRouteName={route}>
						{onboarded === 'explored' ? (
							<Stack.Screen name="Login" component={Login} options={{ headerShown: false }} />
						) : (
							<Stack.Screen
								name="OnboardingRootNav"
								component={OnboardingRootNav}
								options={{ headerShown: false }}
							/>
						)}
						{userLoggedIn && (
							<Stack.Screen name="HomeNav" component={Main} options={{ headerShown: false }} />
						)}
					</Stack.Navigator>
				</NavigationContainer>
			</>
		)) ||
		null
	);
};

const mapStateToProps = (state) => ({
	userLoggedIn: state.user.userLoggedIn,
	selectedAddress: state.engine.backgroundState?.PreferencesController?.selectedAddress,
});

export default connect(mapStateToProps)(App);
