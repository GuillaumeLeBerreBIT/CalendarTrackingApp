export function validatePassword (password) {

    const minLength = 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*/]/.test(password)

    if (password.length < minLength) {

        return [false, 'Password is too short. Please provide a password with at least 8 characters.']
    } 

    if (!hasUpper) {
        return [false, 'Provide at least one capital.']
    } 
    if (!hasNumber) {
        return [false, 'Provide at least one number.']
    }

    if (!hasSpecialChar) {
        return [false, 'Use at least one special character: !@#$%^&*']
    }

    return [true, null]

};

export function createEventObj (events) {

    let eventObj = {}
    for (const [key, val] of Object.entries(events)) {
        eventObj[key] = val
    }

    if (!eventObj.startTime || !eventObj.endTime) {
        eventObj.allDay = true;
    }

    if (eventObj.allDay) {
        eventObj.startTime = null;
        eventObj.endTime = null;
    }

    return eventObj
}