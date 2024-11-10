import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/core/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { PrismaClient } from '@prisma/client';
import { GOOGLE_ID, GOOGLE_SECRET, AUTH_SECRET } from '$env/static/private';
import { sequence } from '@sveltejs/kit/hooks';

const prisma = new PrismaClient();

const adapter = PrismaAdapter(prisma);
// Security headers middleware
const securityHeaders = async ({ event, resolve }) => {
	const response = await resolve(event);

	// response.headers.set('X-Frame-Options', 'DENY');
	// response.headers.set('X-Content-Type-Options', 'nosniff');
	// response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	// response.headers.set('X-XSS-Protection', '1; mode=block');
	// response.headers.set(
	//   'Content-Security-Policy',
	//   "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;"
	// );

	return response;
};

const auth = SvelteKitAuth({
	adapter,
	providers: [Google({ clientId: GOOGLE_ID, clientSecret: GOOGLE_SECRET })],
	callbacks: {
		async session({ session, user }) {
			if (session?.user) {
				session.user.id = user.id;

				const getUser = await adapter.getUser(user.id);
				if (!getUser) await createUser;
				const dbUser = await prisma.user.findUnique({
					where: { id: user.id },
					select: { premium: true, premiumUntil: true }
				});

				session.user.premium = dbUser?.premium || false;
				session.user.premiumUntil = dbUser?.premiumUntil;
			}
			return session;
		}
	},
	pages: {
		signIn: '/login'
	},

	secret: AUTH_SECRET
});

// Premium guard middleware
const premiumGuard = async ({ event, resolve }) => {
	const session = await event.locals.getSession();
	const premiumRoutes = ['/app/ai-recommendations', '/app/study-analytics'];

	if (premiumRoutes.some((route) => event.url.pathname.startsWith(route))) {
		if (!session?.user?.premium) {
			return new Response('Premium subscription required', { status: 403 });
		}
	}

	return resolve(event);
};

export const handle = sequence(securityHeaders, auth.handle, premiumGuard);