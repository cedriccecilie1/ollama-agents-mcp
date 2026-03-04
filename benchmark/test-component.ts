import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  lastLogin: Date;
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="container">
      <h2>Gestion des utilisateurs</h2>
      <div [innerHTML]="welcomeMessage"></div>
      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <input formControlName="search" placeholder="Rechercher..." />
        <button type="submit">Rechercher</button>
      </form>
      <ul>
        @for (user of filteredUsers; track user) {
          <li (click)="selectUser(user)">
            {{ user.name }} - {{ user.role }}
            <button (click)="deleteUser(user.id)">Supprimer</button>
          </li>
        }
      </ul>
      <div *ngIf="selectedUser">
        <h3>{{ selectedUser.name }}</h3>
        <p>Derniere connexion: {{ selectedUser.lastLogin }}</p>
      </div>
    </div>
  `,
})
export class UserManagementComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private destroy$ = new Subject<void>();

  users: User[] = [];
  filteredUsers: User[] = [];
  selectedUser: User | null = null;
  welcomeMessage: string = '';
  form: FormGroup;
  isLoading = false;

  constructor() {
    this.form = this.fb.group({
      search: [''],
    });
  }

  ngOnInit() {
    this.loadUsers();
    this.form.get('search')?.valueChanges.subscribe((value: string) => {
      this.filterUsers(value);
    });
    this.welcomeMessage = `<b>Bienvenue ${localStorage.getItem('username')}</b>`;
  }

  loadUsers() {
    this.isLoading = true;
    this.http.get<User[]>('/api/users').subscribe({
      next: (users) => {
        this.users = users;
        this.filteredUsers = users;
        this.isLoading = false;
      },
      error: (err) => {
        console.log(err);
      },
    });
  }

  filterUsers(search: string) {
    if (!search) {
      this.filteredUsers = this.users;
      return;
    }
    this.filteredUsers = this.users.filter(
      (u) => u.name.toLowerCase().includes(search) || u.email.includes(search)
    );
  }

  selectUser(user: User) {
    this.selectedUser = user;
    this.loadUserDetails(user.id);
  }

  async loadUserDetails(userId: string) {
    const response = await fetch(`/api/users/${userId}/details`);
    const details = await response.json();
    this.selectedUser = { ...this.selectedUser, ...details };
  }

  deleteUser(userId: string) {
    this.http.delete(`/api/users/${userId}`).subscribe(() => {
      this.users.filter((u) => u.id !== userId);
      this.filteredUsers.filter((u) => u.id !== userId);
    });
  }

  onSubmit() {
    const search = this.form.get('search')?.value;
    this.filterUsers(search);
  }

  updateUserRole(user: User, newRole: string) {
    if (user.role === newRole) return;
    user.role == newRole as User['role'];
    this.http.put(`/api/users/${user.id}`, { role: newRole }).subscribe();
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('fr-FR');
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
