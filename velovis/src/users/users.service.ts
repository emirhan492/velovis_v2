// Dosya: src/users/users.service.ts

import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from 'src/auth/auth.service';
import * as bcrypt from 'bcrypt';
// TypeORM ile ilgili tüm 'import'lar kaldırıldı.

@Injectable()
export class UsersService {
  constructor(
    // Projenizin orijinal (doğru) yapısı:
    private prisma: PrismaService,
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService,
  ) {}

  // =================================================================
  // === MEVCUT METODLARINIZ (PRISMA İLE ÇALIŞAN) ===
  // =================================================================

  async create(data: any) {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
      },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        fullName: true,
        username: true,
        email: true,
        createdAt: true,
        updatedAt: true,

        // --- ÇÖZÜM BURADA: Rolleri ve rolün adını seç ---
        roles: {
          select: {
            role: { // user.roles[0].role
              select: {
                id: true,
                name: true, // user.roles[0].role.name
              },
            },
          },
        },
        // --- ÇÖZÜM BİTTİ ---
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Bir kullanıcıyı KULLANICI ADINA göre bulur (login için).
   * Bu, sizin 'findOne' metodunuzdur.
   */
  async findOne(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
      include: { roles: true },
    });
  }

  async update(id: string, data: any) {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }

  // =================================================================
  // === YENİ EKLENEN METODLAR (PRISMA İLE ÇALIŞAN) ===
  // (Hataları çözmek için)
  // =================================================================

  /**
   * Bir kullanıcıyı E-POSTA adresine göre bulur (forgotPassword için gerekli).
   */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Bir kullanıcıyı ID'sine göre bulur (resetPassword için gerekli).
   */
  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Bir kullanıcının şifresini günceller (resetPassword için gerekli).
   */
  async updatePassword(id: string, newPassword: string) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    return this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });
  }

  /**
   * Bir kullanıcının tüm oturumlarını (refreshToken) geçersiz kılar.
   * (Güvenlik için şifre sıfırlama sonrası kullanılır)
   */
  async invalidateAllRefreshTokens(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });
  }
}
