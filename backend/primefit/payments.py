import json
import urllib.error
import urllib.request

from django.conf import settings


class PayChanguError(Exception):
    pass


def _request(path, method="GET", body=None):
    secret_key = getattr(settings, "PAYCHANGU_SECRET_KEY", "")
    if not secret_key:
        raise PayChanguError("Event payments are not configured. Please contact the event organizer.")
    request = urllib.request.Request(
        f"https://api.paychangu.com{path}",
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise PayChanguError("Could not reach the payment provider. Please try again.") from error
    if not isinstance(result, dict) or result.get("status") != "success":
        raise PayChanguError("The payment provider could not process this request.")
    return result.get("data") or {}


def initiate_event_payment(payment):
    callback_url = getattr(settings, "PAYCHANGU_CALLBACK_URL", "")
    if not callback_url:
        raise PayChanguError("Event payments are not configured. Please contact the event organizer.")
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    first_name = payment.first_name
    last_name = payment.last_name
    customer_name = f"{first_name} {last_name}".strip()
    result = _request("/payment", method="POST", body={
        "amount": str(payment.amount),
        "currency": payment.currency,
        "tx_ref": str(payment.tx_ref),
        "first_name": first_name,
        "last_name": last_name,
        "email": payment.email,
        "callback_url": callback_url,
        "return_url": f"{frontend_url}/events/payment",
        "customization": {
            "title": payment.event.title[:30],
            "description": f"Event registration for {customer_name}"[:100],
        },
    })
    checkout_url = result.get("checkout_url")
    if not checkout_url:
        raise PayChanguError("The payment provider did not return a checkout link.")
    return checkout_url


def initiate_challenge_payment(payment):
    callback_url = getattr(settings, "PAYCHANGU_CALLBACK_URL", "")
    if not callback_url:
        raise PayChanguError("Challenge payments are not configured. Please contact the challenge organizer.")
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    customer_name = f"{payment.first_name} {payment.last_name}".strip()
    result = _request("/payment", method="POST", body={
        "amount": str(payment.amount),
        "currency": payment.currency,
        "tx_ref": str(payment.tx_ref),
        "first_name": payment.first_name,
        "last_name": payment.last_name,
        "email": payment.email,
        "callback_url": callback_url,
        "return_url": f"{frontend_url}/challenges/payment",
        "customization": {
            "title": payment.challenge.title[:30],
            "description": f"Challenge registration for {customer_name}"[:100],
        },
    })
    checkout_url = result.get("checkout_url")
    if not checkout_url:
        raise PayChanguError("The payment provider did not return a checkout link.")
    return checkout_url


def verify_event_payment(tx_ref):
    return _request(f"/verify-payment/{tx_ref}")
