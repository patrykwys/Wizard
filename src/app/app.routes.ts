import { Routes } from '@angular/router';
import { provideDispatcher } from '@ngrx/signals/events';
import { ProductDraftStore } from './store/product-draft.store';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  {
    path: 'home',
    loadComponent: () => import('./home/home').then((c) => c.HomeComponent),
    // canActivate: [MsalGuard],  // <-- your auth guard goes here
    // The wizard's store + event dispatcher are scoped to the home route:
    // created when /home is entered, destroyed on leave, and co-located so the
    // dispatcher (used by step components) and the store's reducer/handlers
    // share ONE event bus instance.
    providers: [provideDispatcher(), ProductDraftStore],
  },
  { path: '**', redirectTo: 'home' },
];
