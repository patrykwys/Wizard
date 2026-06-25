import { Routes } from '@angular/router';
import { provideDispatcher } from '@ngrx/signals/events';
import { Wizard } from './wizard/wizard';
import { ProductDraftStore } from './store/product-draft.store';

export const routes: Routes = [
  {
    path: '',
    component: Wizard,
    // Store + event scope live and die with the wizard route (not root).
    providers: [provideDispatcher(), ProductDraftStore],
  },
];
