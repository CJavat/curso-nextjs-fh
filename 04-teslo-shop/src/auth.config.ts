import { z } from "zod";
import bcrypt from "bcryptjs";

import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";

import prisma from "./lib/prisma";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/auth/login",
    newUser: "/auth/new-account",
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (!parsedCredentials.success) return null;

        const { email, password } = parsedCredentials.data;

        // Buscar correo
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (!user) return null;

        // Comparar contraseñas
        if (!bcrypt.compareSync(password, user.password)) return null;

        // Regresar el usuario sin el password
        const { password: _, ...rest } = user;
        console.log(_);

        return rest;
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_ID ?? "",
      clientSecret: process.env.GOOGLE_SECRET ?? "",

      async profile(profile) {
        const userExists = await prisma.user.findUnique({
          where: { email: profile.email },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            emailVerified: true,
            image: true,
          },
        });
        if (userExists) return { ...userExists };

        const user = await prisma.user.create({
          data: {
            name: profile.name,
            email: profile.email,
            password: bcrypt.hashSync("password", 10),
            image: profile.picture,
          },
        });

        const { password: _, ...rest } = user;
        console.log(_);

        return {
          ...rest,
        };
      },
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_ID ?? "",
      clientSecret: process.env.FACEBOOK_SECRET ?? "",

      async profile(profile) {
        const userExists = await prisma.user.findUnique({
          where: { email: profile.email },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            emailVerified: true,
            image: true,
          },
        });
        if (userExists) return userExists;

        const user = await prisma.user.create({
          data: {
            name: profile.name,
            email: profile.email,
            password: bcrypt.hashSync("password", 10),
            image: profile.picture.data.url,
          },
        });

        const { password: _, ...rest } = user;
        console.log(_);

        return {
          ...rest,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account && profile) {
        let dbUser = await prisma.user.findUnique({
          where: { email: profile.email! },
        });

        if (!dbUser) {
          // Crear el usuario si no existe en la base de datos
          dbUser = await prisma.user.create({
            data: {
              name: profile.name!,
              email: profile.email!,
              password: bcrypt.hashSync("password", 10),
              image: profile.picture,
            },
          });
        }

        token.id = dbUser.id;
        token.email = dbUser.email;
        token.name = dbUser.name;
        token.image = dbUser.image;
        token.role = dbUser.role;
      }

      if (account?.provider === "credentials") {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.image = user.image;
        token.role = user.role;
      }

      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id,
        email: token.email,
        name: token.name,
        image: token.image,
        role: token.role,
      } as any;

      return session;
    },
  },
};

export const { signIn, signOut, auth, handlers } = NextAuth(authConfig);
