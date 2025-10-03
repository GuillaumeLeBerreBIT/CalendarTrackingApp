export default function validatePassword(password) {

    const minLength = 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*/]/.test(password)

    if (password.length < minLength) {

        return [false, 'Password is to small please provide a passsword with more then 8 characters.']
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