import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
// 'User' tipi @prisma/client'dan geliyorsa ve 'usersService' tarafından kullanılıyorsa bu importu saklayın
// import { User } from '@prisma/client'; 
import { ChangePasswordDto } from './dto/change-password.dto';
import { MailerService } from '@nestjs-modules/mailer';
import * as crypto from 'crypto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UsersService } from '../users/users.service';
//import { ConflictException } from '@nestjs/common'; // Bu satır zaten yukarıda var, yoruma alındı.

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailerService: MailerService,
    private usersService: UsersService,
  ) {}

  // =================================================================
  // REGISTER (Kayıt Ol)
  // =================================================================
  async register(registerDto: RegisterDto) {
    // UsersService'in 'create' metodu zaten e-posta/kullanıcı adı kontrolünü yapmalı
    // ve çakışma (conflict) durumunda bir ConflictException fırlatmalıdır.
    const newUser = await this.usersService.create(registerDto);

    // Aktivasyon token'ı oluşturma
    const payload = { sub: newUser.id };
    const token = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACTIVATION_SECRET'),
      expiresIn: '1d', // 1 gün geçerli
    });

    const activationUrl = `${this.configService.get<string>(
      'API_URL', // .env'deki backend URL'niz (örn: http://localhost:3000)
    )}/auth/activate?token=${token}`;

    // Aktivasyon e-postası gönderme
    await this.mailerService.sendMail({
      to: newUser.email,
      subject: 'Velovis Hesap Aktivasyonu',
      html: `
        <p>Merhaba ${newUser.fullName},</p>
        <p>Hesabınızı aktifleştirmek için lütfen aşağıdaki linke tıklayın:</p>
        <p><a href="${activationUrl}" target="_blank">Hesabımı Aktifleştir</a></p>
        <p>Bu link 1 gün geçerlidir.</p>
      `,
    });

    return {
      message:
        'Kayıt başarılı. Hesabınızı aktifleştirmek için lütfen e-postanızı kontrol edin.',
    };
  }

  // =================================================================
  // LOGIN (Giriş Yap)
  // =================================================================
  async login(loginDto: LoginDto) {
    const { username, password } = loginDto;

    const user = await this.prisma.user.findUnique({ where: { username } });

    if (!user) {
      throw new UnauthorizedException('Kullanıcı adı veya parola hatalı.');
    }

    if (!user.isActive) {
      throw new ForbiddenException(
        'Hesabınız henüz aktifleştirilmemiş. Lütfen e-postanızı kontrol edin.',
      );
    }

    const isPasswordMatching = await bcrypt.compare(password, user.password);

    if (!isPasswordMatching) {
      throw new UnauthorizedException('Kullanıcı adı veya parola hatalı.');
    }

    const tokens = await this.getTokens(user.id, user.username);
    await this.storeRefreshToken(tokens.refreshToken, user.id);
    return tokens;
  }

  // =================================================================
  // REFRESH TOKEN (Token Yenile)
  // =================================================================
  async refreshToken(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new ForbiddenException('Erişim reddedildi.');

    const dbToken = await this.findValidRefreshToken(user.id, refreshToken);

    if (!dbToken) {
      throw new ForbiddenException('Erişim reddedildi (Token geçersiz).');
    }

    // Mevcut token'ı geçersiz kıl
    await this.prisma.refreshToken.update({
      where: { id: dbToken.id },
      data: { invalidatedAt: new Date() },
    });

    // Yeni token'lar oluştur ve kaydet
    const newTokens = await this.getTokens(user.id, user.username);
    await this.storeRefreshToken(newTokens.refreshToken, user.id);
    return newTokens;
  }

  // =================================================================
  // LOGOUT (Çıkış Yap)
  // =================================================================
  async logout(userId: string, refreshToken: string) {
    const dbToken = await this.findValidRefreshToken(userId, refreshToken);

    if (!dbToken) {
      return { message: 'Başarıyla çıkış yapıldı (Token zaten geçersizdi).' };
    }

    await this.prisma.refreshToken.update({
      where: { id: dbToken.id },
      data: { invalidatedAt: new Date() },
    });

    return { message: 'Başarıyla çıkış yapıldı.' };
  }

  // =================================================================
  // LOGOUT ALL (Tüm Oturumlardan Çıkış Yap)
  // =================================================================
  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId: userId,
        invalidatedAt: null,
      },
      data: {
        invalidatedAt: new Date(),
      },
    });

    return { message: 'Tüm oturumlardan başarıyla çıkış yapıldı.' };
  }

  // =================================================================
  // ŞİFRE DEĞİŞTİRME (Change Password)
  // =================================================================
  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Kullanıcı bulunamadı.');
    }

    const isPasswordMatching = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isPasswordMatching) {
      throw new ForbiddenException('Mevcut şifreniz hatalı.');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedNewPassword,
      },
    });

    // Şifre değiştiğinde tüm aktif refresh token'ları geçersiz kıl
    await this.prisma.refreshToken.updateMany({
      where: {
        userId: userId,
        invalidatedAt: null,
      },
      data: {
        invalidatedAt: new Date(),
      },
    });

    return {
      message:
        'Şifreniz başarıyla güncellendi. Güvenlik nedeniyle diğer oturumlarınız sonlandırıldı.',
    };
  }

  // =================================================================
  // ŞİFREMİ UNUTTUM (Forgot Password)
  // =================================================================
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`Şifre sıfırlama denemesi (kullanıcı bulunamadı): ${email}`);
      // Kullanıcının var olup olmadığını belli etmemek güvenlik için daha iyidir
      return {
        message:
          'Eğer bu e-posta adresi kayıtlıysa, bir sıfırlama linki gönderildi.',
      };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 saat geçerli

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: token,
        expiresAt: expiresAt,
      },
    });

    // Bu URL'i kendi frontend URL'iniz ile değiştirmelisiniz
    const resetUrl = `http://localhost:3001/reset-password?token=${token}`;

    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Velovis Şifre Sıfırlama Talebi',
      html: `
        <p>Merhaba ${user.fullName},</p>
        <p>Hesabınız için bir şifre sıfırlama talebi aldık.</p>
        <p>Yeni bir şifre belirlemek için lütfen aşağıdaki linke tıklayın:</p>
        <a href="${resetUrl}" target="_blank">Şifremi Sıfırla</a>
        <p>Bu link 1 saat geçerlidir.</p>
      `,
    });

    console.log(`Şifre sıfırlama linki gönderildi: ${email}`);
    return {
      message:
        'Eğer bu e-posta adresi kayıtlıysa, bir sıfırlama linki gönderildi.',
    };
  }

  // =================================================================
  // ŞİFREYİ SIFIRLA (Reset Password)
  // =================================================================
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: token },
    });

    if (!resetToken) {
      throw new ForbiddenException('Geçersiz veya süresi dolmuş sıfırlama linki.');
    }

    if (new Date() > resetToken.expiresAt) {
      await this.prisma.passwordResetToken.delete({
        where: { id: resetToken.id },
      });
      throw new ForbiddenException('Geçersiz veya süresi dolmuş sıfırlama linki.');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // İşlemlerin hepsinin başarılı olmasını garantilemek için transaction kullan
    await this.prisma.$transaction(async (tx) => {
      // 1. Kullanıcı şifresini güncelle
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedNewPassword },
      });
      // 2. Kullanılan sıfırlama token'ını sil
      await tx.passwordResetToken.delete({
        where: { id: resetToken.id },
      });
      // 3. Güvenlik için tüm refresh token'ları geçersiz kıl
      await tx.refreshToken.updateMany({
        where: { userId: resetToken.userId, invalidatedAt: null },
        data: { invalidatedAt: new Date() },
      });
    });

    return {
      message: 'Şifreniz başarıyla sıfırlandı. Şimdi giriş yapabilirsiniz.',
    };
  }

  // =================================================================
  // HESAP AKTIVASYONU
  // =================================================================
  async activateAccount(token: string) {
    let userId: string;
    try {
      // 1. Token'ı 'JWT_ACTIVATION_SECRET' ile doğrula
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_ACTIVATION_SECRET'),
      });
      userId = payload.sub;
    } catch (error) {
      throw new UnauthorizedException(
        'Geçersiz veya süresi dolmuş aktivasyon linki.',
      );
    }

    // 2. Kullanıcıyı bul
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    // 3. Zaten aktif mi diye kontrol et
    if (user.isActive) {
      // Hata vermek yerine, işlemin zaten yapıldığını belirtebiliriz
      return { message: 'Hesap zaten aktif.' };
    }

    // 4. Kullanıcıyı aktifleştir
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    return { message: 'Hesabınız başarıyla aktifleştirildi.' };
  }

  // =================================================================
  // YARDIMCI FONKSİYONLAR (Helpers)
  // =================================================================

  /**
   * Access ve Refresh token'ları oluşturur.
   */
  private async getTokens(userId: string, username: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, username },
        {
          secret: this.configService.get('JWT_SECRET'),
          expiresIn: this.configService.get('JWT_EXPIRATION'),
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, username },
        {
          secret: this.configService.get('REFRESH_TOKEN_SECRET'),
          expiresIn: this.configService.get('REFRESH_TOKEN_EXPIRATION'),
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Refresh token'ı hash'leyerek veritabanına kaydeder.
   */
  private async storeRefreshToken(token: string, userId: string) {
    const hashedToken = await bcrypt.hash(token, 10);
    await this.prisma.refreshToken.create({
      data: {
        userId: userId,
        hashedToken: hashedToken,
      },
    });
  }

  /**
   * Verilen token ile veritabanındaki geçerli (invalidatedAt = null)
   * token'ları karşılaştırır ve eşleşeni bulur.
   */
  private async findValidRefreshToken(userId: string, token: string) {
    const userTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId: userId,
        invalidatedAt: null, // Sadece hala geçerli olan token'ları getir
      },
    });

    // Gelen token ile hash'lenmiş token'ları tek tek karşılaştır
    for (const dbToken of userTokens) {
      const isMatch = await bcrypt.compare(token, dbToken.hashedToken);
      if (isMatch) {
        return dbToken;
      }
    }
    return null; // Eşleşen geçerli token bulunamadı
  }
} // <-- Sınıfın (AuthService) kapanış parantezi