import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Wizard } from '../wizard/wizard';

/**
 * Home page. The wizard renders here. The wizard's store + event bus are
 * provided by the `home` route (see app.routes.ts), so they live for as long
 * as the user is on /home and are torn down on leave.
 */
@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Wizard],
  template: `<app-wizard />`,
})
export class HomeComponent {}
