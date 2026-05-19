import { useAuth, useSignIn, useSignUp } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useMockFontSet } from '@/components/mockup-font-provider';
import {
  AppScreen,
  Banner,
  Button,
  Card,
  EditorialHero,
  SegmentedControl,
  Text,
  TextInput,
} from '@/components/ui';
import { BrandAssets } from '@/constants/brand-assets';
import { Brand, Radius } from '@/constants/theme';

type AuthMode = 'signIn' | 'signUp';

// Discriminator for the pending-verification step after the initial submit.
// `sign_up_email_code` is the existing first-factor email confirmation during
// sign-up; `sign_in_email_code_2fa` is Clerk's second-factor email code that
// kicks in when 2FA is enabled in the dashboard.
type PendingStep = 'none' | 'sign_up_email_code' | 'sign_in_email_code_2fa';

const modeOptions = [
  { label: 'Sign in', value: 'signIn' },
  { label: 'Create account', value: 'signUp' },
] as const;

export default function SignInScreen() {
  const { headlineMood } = useMockFontSet();
  const { isSignedIn } = useAuth();
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp } = useSignUp();
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingStep, setPendingStep] = useState<PendingStep>('none');
  const [secondFactorEmailAddressId, setSecondFactorEmailAddressId] = useState<string | null>(null);
  const isPendingVerification = pendingStep !== 'none';
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const decorativeStyle =
    headlineMood === 'steady'
      ? styles.previewSteady
      : headlineMood === 'breezy'
        ? styles.previewBreezy
        : styles.previewPostcard;

  // Hooks must run unconditionally (rules-of-hooks); the signed-in redirect
  // happens after all hooks below.
  const fieldErrors = useMemo(() => {
    const errors: {
      email?: string;
      password?: string;
      confirmPassword?: string;
      verificationCode?: string;
    } = {};

    if (email.length > 0 && !email.includes('@')) {
      errors.email = 'Enter a valid email address';
    }
    if (password.length > 0 && password.length < 8) {
      errors.password = 'Use at least 8 characters';
    }
    if (mode === 'signUp' && confirmPassword.length > 0 && confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match';
    }
    if (isPendingVerification && verificationCode.length > 0 && verificationCode.length < 6) {
      errors.verificationCode = 'Enter the 6-digit code';
    }

    return errors;
  }, [confirmPassword, email, mode, password, isPendingVerification, verificationCode]);

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  const handleSubmit = async () => {
    if (isPendingVerification) {
      await handleVerificationSubmit();
      return;
    }

    if (!email || !password || (mode === 'signUp' && !confirmPassword)) {
      setErrorMessage('Please complete every required field.');
      return;
    }

    if (fieldErrors.email || fieldErrors.password || fieldErrors.confirmPassword) {
      setErrorMessage('Please fix the highlighted fields.');
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      if (mode === 'signIn') {
        if (!signInLoaded) {
          throw new Error('Sign-in is still loading.');
        }

        const result = await signIn.create({
          identifier: email,
          password,
        });

        if (result.createdSessionId) {
          await setActive?.({ session: result.createdSessionId });
          return;
        }

        // Clerk dashboard configured email_code as a required second factor.
        // Password verified at this point; we now prepare and prompt for the
        // 6-digit email code.
        if (result.status === 'needs_second_factor') {
          const emailFactor = result.supportedSecondFactors?.find(
            (f) => f.strategy === 'email_code',
          );
          if (!emailFactor || !emailFactor.emailAddressId) {
            setInfoMessage('Two-factor sign-in is required, but no email-code factor was offered.');
            return;
          }
          await signIn.prepareSecondFactor({
            strategy: 'email_code',
            emailAddressId: emailFactor.emailAddressId,
          });
          setSecondFactorEmailAddressId(emailFactor.emailAddressId);
          setPendingStep('sign_in_email_code_2fa');
          setInfoMessage('Check your email for a 6-digit verification code.');
          return;
        }

        setInfoMessage('Additional sign-in steps are required for this account.');
      } else {
        if (!signUpLoaded) {
          throw new Error('Sign-up is still loading.');
        }

        const result = await signUp.create({
          emailAddress: email,
          password,
        });

        if (result.createdSessionId) {
          await setActive?.({ session: result.createdSessionId });
          return;
        }

        if (result.unverifiedFields?.includes('email_address')) {
          await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
          setPendingStep('sign_up_email_code');
          setInfoMessage('Check your email for a 6-digit verification code.');
        } else {
          setInfoMessage('Your account was created, but more verification steps are required.');
        }
      }
    } catch (error: unknown) {
      const message = getClerkErrorMessage(error);
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationSubmit = async () => {
    if (!verificationCode) {
      setErrorMessage('Enter the verification code from your email.');
      return;
    }
    if (fieldErrors.verificationCode) {
      setErrorMessage(fieldErrors.verificationCode);
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      if (pendingStep === 'sign_up_email_code') {
        if (!signUpLoaded) {
          setErrorMessage('Verification is still loading.');
          return;
        }
        const result = await signUp.attemptEmailAddressVerification({
          code: verificationCode,
        });
        if (result.createdSessionId) {
          await setActive?.({ session: result.createdSessionId });
          return;
        }
        setInfoMessage(
          'Verification succeeded, but another step is still required for this account.',
        );
        return;
      }

      if (pendingStep === 'sign_in_email_code_2fa') {
        if (!signInLoaded) {
          setErrorMessage('Verification is still loading.');
          return;
        }
        const result = await signIn.attemptSecondFactor({
          strategy: 'email_code',
          code: verificationCode,
        });
        if (result.createdSessionId) {
          await setActive?.({ session: result.createdSessionId });
          return;
        }
        setInfoMessage(
          'Verification succeeded, but another step is still required for this account.',
        );
        return;
      }
    } catch (error: unknown) {
      setErrorMessage(getClerkErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const resendVerificationCode = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      if (pendingStep === 'sign_up_email_code') {
        if (!signUpLoaded) return;
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      } else if (pendingStep === 'sign_in_email_code_2fa') {
        if (!signInLoaded || !secondFactorEmailAddressId) return;
        await signIn.prepareSecondFactor({
          strategy: 'email_code',
          emailAddressId: secondFactorEmailAddressId,
        });
      } else {
        return;
      }
      setInfoMessage('A fresh verification code was sent to your email.');
    } catch (error: unknown) {
      setErrorMessage(getClerkErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen>
      <EditorialHero
        imageSource={BrandAssets.settingsHero}
        metaLeft="may @2026"
        metaCenter="evenly"
        metaRight="sign in"
        headline={`breezy\nsplits`}
        subtitle="Friendly enough for a holiday. Clear enough for shared money."
        headlineStyle={decorativeStyle}
      />

      <Card raised style={styles.formCard}>
        <View style={styles.formHeader}>
          <View style={styles.wordmarkBadge}>
            <Ionicons name="cloud" size={20} color={Brand.interactive} />
          </View>
          <View style={styles.formTitleBlock}>
            <Text variant="display" style={styles.formTitle}>
              Evenly
            </Text>
            <Text variant="body" color="textSecondary">
              Scan, split, and save with less friction.
            </Text>
          </View>
        </View>

        <SegmentedControl<AuthMode>
          options={modeOptions}
          value={mode}
          onChange={(value) => {
            setMode(value);
            setErrorMessage(null);
            setInfoMessage(null);
            setPendingStep('none');
            setSecondFactorEmailAddressId(null);
            setVerificationCode('');
          }}
        />

        {errorMessage ? (
          <Banner variant="error" description={errorMessage} />
        ) : infoMessage ? (
          <Banner variant="info" description={infoMessage} />
        ) : null}

        <View style={styles.formFields}>
          {isPendingVerification ? (
            <TextInput
              label="Verification code"
              value={verificationCode}
              onChangeText={setVerificationCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="123456"
              error={fieldErrors.verificationCode}
              helper={`Sent to ${email}`}
            />
          ) : (
            <>
              <TextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
                error={fieldErrors.email}
              />
              <TextInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
                placeholder="Enter your password"
                error={fieldErrors.password}
              />
              {mode === 'signUp' ? (
                <TextInput
                  label="Confirm password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  textContentType="password"
                  placeholder="Repeat your password"
                  error={fieldErrors.confirmPassword}
                />
              ) : null}
            </>
          )}
        </View>

        <View style={styles.actionStack}>
          <Button
            label={
              isPendingVerification
                ? 'Verify email'
                : mode === 'signIn'
                  ? 'Continue'
                  : 'Create account'
            }
            size="lg"
            fullWidth
            loading={loading}
            disabled={loading || !signInLoaded || !signUpLoaded}
            onPress={handleSubmit}
          />
          {isPendingVerification ? (
            <Button
              label="Send a new code"
              size="lg"
              variant="secondary"
              fullWidth
              disabled={loading || !signUpLoaded}
              onPress={resendVerificationCode}
            />
          ) : (
            <Button label="Continue with Google" size="lg" variant="secondary" fullWidth />
          )}
        </View>

        <View style={styles.footerRow}>
          <Text variant="caption" color="textSecondary">
            {isPendingVerification
              ? 'Used a different email?'
              : mode === 'signIn'
                ? 'New to Evenly?'
                : 'Already have an account?'}
          </Text>
          <Button
            label={
              isPendingVerification
                ? 'Start again'
                : mode === 'signIn'
                  ? 'Create account'
                  : 'Sign in instead'
            }
            size="sm"
            variant="ghost"
            onPress={() => {
              if (isPendingVerification) {
                setPendingStep('none');
                setSecondFactorEmailAddressId(null);
                setVerificationCode('');
              } else {
                setMode(mode === 'signIn' ? 'signUp' : 'signIn');
              }
              setErrorMessage(null);
              setInfoMessage(null);
            }}
          />
        </View>
      </Card>
    </AppScreen>
  );
}

function getClerkErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'errors' in error) {
    const clerkErrors = (error as { errors?: { longMessage?: string; message?: string }[] }).errors;
    const first = clerkErrors?.[0];
    if (first?.longMessage) return first.longMessage;
    if (first?.message) return first.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  formCard: {
    gap: 16,
  },
  formHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  wordmarkBadge: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.washBg,
  },
  formTitleBlock: {
    flex: 1,
    gap: 4,
  },
  formTitle: {
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: -1.4,
  },
  formFields: {
    gap: 12,
  },
  actionStack: {
    gap: 12,
  },
  footerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  previewSteady: {},
  previewBreezy: {
    fontFamily: 'PeaceSans',
    letterSpacing: -2.4,
  },
  previewPostcard: {
    fontFamily: 'Fraunces_700Bold',
    letterSpacing: -1.8,
  },
});
