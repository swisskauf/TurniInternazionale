import { App as CapApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useStore } from '@/store/store';

/** Native shell integration: status bar colors, splash, Android back button. */
export async function initNative() {
  const apply = () => {
    const dark = document.documentElement.classList.contains('dark');
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack && window.location.hash && window.location.hash !== '#/') window.history.back();
    else CapApp.minimizeApp();
  });
  const hide = () => SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => undefined);
  if (useStore.getState().hydrated) hide();
  else {
    const unsub = useStore.subscribe((s) => {
      if (s.hydrated) {
        unsub();
        hide();
      }
    });
  }
}
