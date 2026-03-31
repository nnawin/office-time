import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { interval, Subscription } from 'rxjs';
import { startWith } from 'rxjs/operators';

interface EtaEntry {
  eta: string | null;
  rmk_en: string;
  dest_en: string;
  eta_seq: number;
}

interface EtaResponse {
  data: EtaEntry[];
  generated_timestamp: string;
}

interface StopEta {
  minutesAway: number | null;
  time: string;
  remark: string;
  isRealTime: boolean;
}

interface StopData {
  name: string;
  stopId: string;
  etas: StopEta[];
  lastUpdated: string;
  loading: boolean;
  error: boolean;
}

interface RouteInfo {
  routeNumber: string;
  destination: string;
  stops: { name: string; stopId: string }[];
}

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  selectedRoute = signal<'E11S' | 'E32A'>('E11S');

  private stopsSignal = signal<StopData[]>([]);
  private currentRouteInfo = this.getRouteInfo('E11S');

  get stops() {
    return this.stopsSignal();
  }

  get routeNumber(): string {
    return this.currentRouteInfo.routeNumber;
  }

  get destination(): string {
    return this.currentRouteInfo.destination;
  }

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.updateClock();
    this.clockSub = interval(1000).subscribe(() => this.updateClock());
    this.updateStopsData();
    this.subscription = interval(10000).pipe(startWith(0)).subscribe(() => this.fetchAllEtas());
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
    this.clockSub?.unsubscribe();
  }

  private getRouteInfo(route: 'E11S' | 'E32A'): RouteInfo {
    if (route === 'E11S') {
      return {
        routeNumber: 'E11S',
        destination: 'Tin Hau Station',
        stops: [
          { name: 'Ying Hei Road', stopId: '003443' },
          { name: 'Yu Nga Shopping Centre', stopId: '003815' }
        ]
      };
    }
    return {
      routeNumber: 'E32A',
      destination: 'Tin Hau Station',
      stops: [
        { name: 'Ying Hei Road', stopId: '003443' },
        { name: 'Yu Nga Shopping Centre', stopId: '003815' }
      ]
    };
  }

  private updateStopsData() {
    const routeInfo = this.getRouteInfo(this.selectedRoute());
    this.currentRouteInfo = routeInfo;
    this.stopsSignal.set(routeInfo.stops.map(s => ({
      ...s,
      etas: [],
      lastUpdated: '',
      loading: true,
      error: false
    })));
  }

  updateClock() {
    this.currentTime.set(new Date().toLocaleTimeString('en-HK', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      timeZone: 'Asia/Hong_Kong'
    }));
  }

  fetchAllEtas() {
    const current = this.stops;
    const route = this.selectedRoute();
    current.forEach((stop: StopData, i: number) => {
      this.setStopLoading(i, true);
      const url = `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stop.stopId}/${route}`;
      this.http.get<EtaResponse>(url).subscribe({
        next: (res) => {
          const now = new Date();
          const etas: StopEta[] = (res.data || [])
            .filter(e => e.eta)
            .slice(0, 3)
            .map(e => {
              const etaDate = new Date(e.eta!);
              const diff = Math.round((etaDate.getTime() - now.getTime()) / 60000);
              const remark = (e.rmk_en || '').toLowerCase();
              return {
                minutesAway: diff,
                time: etaDate.toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' }),
                remark: e.rmk_en || '',
                isRealTime: !remark.includes('scheduled')
              };
            });

          const updated = [...this.stops];
          updated[i] = {
            ...updated[i],
            etas,
            loading: false,
            error: false,
            lastUpdated: new Date().toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' })
          };
          this.stopsSignal.set(updated);
        },
        error: () => {
          const updated = [...this.stops];
          updated[i] = { ...updated[i], loading: false, error: true };
          this.stopsSignal.set(updated);
        }
      });
    });
  }

  setStopLoading(index: number, loading: boolean) {
    const updated = [...this.stops];
    updated[index] = { ...updated[index], loading };
    this.stopsSignal.set(updated);
  }

  switchRoute(route: 'E11S' | 'E32A') {
    this.selectedRoute.set(route);
    this.updateStopsData();
  }

  getEtaClass(minutes: number | null): string {
    if (minutes === null) return 'eta-unknown';
    if (minutes <= 2) return 'eta-arriving';
    if (minutes <= 8) return 'eta-soon';
    return 'eta-later';
  }

  getEtaLabel(minutes: number | null): string {
    if (minutes === null) return '-';
    if (minutes <= 0) return 'Arriving';
    if (minutes === 1) return '1 min';
    return `${minutes} mins`;
  }

  refresh() {
    this.fetchAllEtas();
  }

  currentTime = signal('');
  private subscription!: Subscription;
  private clockSub!: Subscription;
}
